import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { compareDocMaps, compareScenario } from './compare-docs.mjs';
import { createRawCouchClient } from './couch-raw.mjs';
import { resolveParityCredentials } from './credentials.mjs';
import { parseDbRef } from './db-guards.mjs';
import { createLegacyCouchAdapter } from './adapters/legacy-couch.mjs';
import { createModernAdapter } from './adapters/modern-api.mjs';

const scenariosDir = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');

export function loadScenario(id) {
    const file = join(scenariosDir, `${id}.json`);
    return JSON.parse(readFileSync(file, 'utf8'));
}

export function resolveIds(scenario, cli = {}) {
    const ids = [...(scenario.ids || [])];
    if (cli.veteran) {
        ids.push(cli.veteran);
    }
    if (cli.guardian) {
        ids.push(cli.guardian);
    }
    if (cli.flight) {
        ids.push(cli.flight);
    }
    return [...new Set(ids.filter(Boolean))];
}

function harnessContext(env) {
    return {
        userName: env.PARITY_USER_NAME || 'harness-user',
        timestamp: new Date().toISOString().split('.')[0] + 'Z'
    };
}

export async function runScenario(scenario, {
    env = process.env,
    fetchImpl = fetch,
    cli = {}
} = {}) {
    const legacyUrl = env.PARITY_LEGACY_DB_URL;
    const modernUrl = env.PARITY_MODERN_DB_URL;
    if (!legacyUrl || !modernUrl) {
        throw new Error('Set PARITY_LEGACY_DB_URL and PARITY_MODERN_DB_URL in .env');
    }

    const { legacy: legacyCreds, modern: modernCreds } = resolveParityCredentials(env, {
        requireLegacy: true,
        requireModern: true
    });
    const ctx = harnessContext(env);
    let ids = resolveIds(scenario, cli);

    const legacyRaw = createRawCouchClient({
        dbUrl: legacyUrl,
        user: legacyCreds.user,
        pass: legacyCreds.pass,
        fetchImpl
    });
    const modernRaw = createRawCouchClient({
        dbUrl: modernUrl,
        user: modernCreds.user,
        pass: modernCreds.pass,
        fetchImpl
    });
    const legacy = createLegacyCouchAdapter({
        dbUrl: legacyUrl,
        user: legacyCreds.user,
        pass: legacyCreds.pass,
        fetchImpl
    });
    const modern = createModernAdapter({
        apiBase: env.PARITY_API_URL,
        token: env.PARITY_API_TOKEN,
        dbUrl: modernUrl,
        dbName: env.PARITY_MODERN_DB_NAME || parseDbRef(modernUrl).name,
        fetchImpl
    });

    if (scenario.operation === 'addToFlight') {
        const waitlistDocs = await legacyRaw.waitlist(scenario.args?.veteranCount || 1);
        const waitlistIds = waitlistDocs.map((doc) => doc._id);
        const guardianIds = waitlistDocs.map((doc) => doc.guardian?.id).filter(Boolean);
        ids = [...new Set([...ids, ...waitlistIds, ...guardianIds])];
        scenario.ids = ids;
        cli.waitlistDocs = waitlistDocs;
    }

    const loadMaps = async (idList) => {
        if (scenario.allDocs) {
            return {
                left: await legacyRaw.allDocs(),
                right: await modernRaw.allDocs()
            };
        }
        if (idList.length === 0) {
            throw new Error(`Scenario ${scenario.id} needs --veteran/--guardian/--flight or ids`);
        }
        return {
            left: await legacyRaw.getMany(idList),
            right: await modernRaw.getMany(idList)
        };
    };

    const before = await loadMaps(ids);
    if (scenario.operation === 'baseline') {
        const result = compareDocMaps(before.left, before.right, { ids: scenario.allDocs ? undefined : ids });
        return { scenario: scenario.id, dirtyBaseline: false, ...result };
    }

    const baseline = compareScenario({
        beforeLeft: before.left,
        beforeRight: before.right,
        afterLeft: before.left,
        afterRight: before.right,
        ids
    });
    if (!baseline.ok) {
        return { scenario: scenario.id, ...baseline };
    }

    await applyOperation(scenario, { legacy, modern, ctx, cli, legacyRaw });

    const afterIds = resolveIds(scenario, cli);
    const after = await loadMaps(afterIds);
    const compared = compareScenario({
        beforeLeft: before.left,
        beforeRight: before.right,
        afterLeft: after.left,
        afterRight: after.right,
        ids: afterIds
    });
    return { scenario: scenario.id, ...compared };
}

async function applyOperation(scenario, { legacy, modern, ctx, cli, legacyRaw }) {
    const veteranId = cli.veteran;
    const guardianId = cli.guardian;
    switch (scenario.operation) {
        case 'editVetNote':
            await legacy.editVetNote(veteranId, scenario.args.note, ctx);
            await modern.editVetNote(veteranId, scenario.args.note);
            break;
        case 'pairGuardian': {
            const veteran = await legacy.get(veteranId);
            const veteranName = `${veteran.name?.first || ''} ${veteran.name?.last || ''}`.trim();
            await legacy.pairGuardian(veteranId, guardianId, ctx);
            await modern.pairGuardian(guardianId, veteranId, veteranName);
            break;
        }
        case 'unpairGuardian':
            await legacy.unpairGuardian(veteranId, guardianId, ctx);
            await modern.unpairGuardian(guardianId);
            break;
        case 'changeSeat':
            await modern.changeSeat(veteranId, scenario.args.seat);
            await legacy.changeSeat(veteranId, scenario.args.seat, ctx);
            break;
        case 'changeBus':
            await modern.changeBus(veteranId, scenario.args.bus);
            await legacy.changeBus(veteranId, scenario.args.bus, ctx);
            break;
        case 'changeCaller':
            await legacy.changeCaller(veteranId, scenario.args.caller, ctx, guardianId);
            await modern.changeCaller(veteranId, scenario.args.caller, guardianId);
            break;
        case 'addToFlight': {
            const veteranCount = scenario.args.veteranCount || 1;
            const flightName = scenario.args.flightName || 'SSHF-ParityHarness';
            const waitlistDocs = cli.waitlistDocs || await legacyRaw.waitlist(veteranCount);
            const waitlistIds = waitlistDocs.map((doc) => doc._id);
            const guardianIds = waitlistDocs.map((doc) => doc.guardian?.id).filter(Boolean);
            scenario.ids = [...new Set([...(scenario.ids || []), ...waitlistIds, ...guardianIds])];
            const flightFields = {
                _id: randomUUID().replace(/-/g, ''),
                name: flightName,
                flight_date: scenario.args.flightDate || '2026-11-01',
                capacity: scenario.args.capacity || 20
            };
            await legacy.createFlight(flightFields, ctx);
            const created = await modern.createFlight({
                name: flightFields.name,
                flight_date: flightFields.flight_date,
                capacity: flightFields.capacity,
                completed: false
            });
            await legacy.addToFlight({ name: flightName }, waitlistDocs, ctx);
            const modernFlightId = created._id || created.id;
            if (!modernFlightId) {
                throw new Error('Modern createFlight did not return an id');
            }
            await modern.addToFlight(modernFlightId, veteranCount);
            break;
        }
        default:
            throw new Error(`Unknown operation ${scenario.operation}`);
    }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
    const scenarioId = argv.find((arg) => !arg.startsWith('--')) || env.PARITY_SCENARIO;
    if (!scenarioId) {
        throw new Error('Usage: npm run parity -- <scenario-id> --veteran <id> [--guardian <id>]');
    }
    const cli = {
        veteran: argValue(argv, '--veteran'),
        guardian: argValue(argv, '--guardian'),
        flight: argValue(argv, '--flight')
    };
    const scenario = loadScenario(scenarioId);
    return runScenario(scenario, { env, cli });
}

function argValue(argv, flag) {
    const index = argv.indexOf(flag);
    if (index === -1) {
        return undefined;
    }
    return argv[index + 1];
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('run-scenario.mjs');
if (invokedDirectly) {
    main()
        .then((result) => {
            console.log(JSON.stringify(result, null, 2));
            if (!result.ok) {
                process.exitCode = 1;
            }
        })
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
