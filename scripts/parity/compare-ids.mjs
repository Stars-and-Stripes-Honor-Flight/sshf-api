import 'dotenv/config';
import path from 'node:path';
import { compareDocs } from './compare-docs.mjs';
import { createRawCouchClient } from './couch-raw.mjs';
import { resolveParityCredentials } from './credentials.mjs';

const ID_REFERENCE_PATH = /^(?:_id|guardian\.id|veteran\.id|veteran\.pairings\[\d+\]\.id)$/;

export function isIdReferencePath(pathName) {
    return ID_REFERENCE_PATH.test(pathName);
}

export function identitySnapshot(doc = {}) {
    const name = doc.name && typeof doc.name === 'object'
        ? [doc.name.first, doc.name.middle, doc.name.last].filter(Boolean).join(' ')
        : String(doc.name || '');
    return {
        type: doc.type || '',
        name,
        birth_date: doc.birth_date || '',
        gender: doc.gender || '',
        city: doc.address?.city || '',
        flight: doc.flight?.id || ''
    };
}

function identityMatch(left, right) {
    return left.type === right.type
        && left.name === right.name
        && left.birth_date === right.birth_date
        && left.gender === right.gender;
}

function formatHeadline(result) {
    const who = `${result.identity.legacy.type || 'Document'} ${result.identity.legacy.name || result.legacyId}`.trim();
    const { fields, history, extraKeys, idReferences } = result.summary.counts;
    const parts = [];
    if (fields === 0 && extraKeys === 0) {
        parts.push('fields match');
    } else {
        if (fields) {
            parts.push(`${fields} field diff${fields === 1 ? '' : 's'}`);
        }
        if (extraKeys) {
            parts.push(`${extraKeys} extra key${extraKeys === 1 ? '' : 's'}`);
        }
    }
    if (idReferences) {
        parts.push(`${idReferences} expected id reference${idReferences === 1 ? '' : 's'}`);
    }
    if (history) {
        parts.push(`${history} history block${history === 1 ? '' : 's'} differ`);
    }
    return `${who}: ${parts.join(', ')}`;
}

function actorAliases(env = {}) {
    const aliases = {};
    const canonical = env.PARITY_USER_NAME;
    if (!canonical) {
        return aliases;
    }
    if (env.PARITY_LEGACY_DB_USER && env.PARITY_LEGACY_DB_USER !== canonical) {
        aliases[env.PARITY_LEGACY_DB_USER] = canonical;
    }
    if (env.PARITY_GOOGLE_DISPLAY_NAME && env.PARITY_GOOGLE_DISPLAY_NAME !== canonical) {
        aliases[env.PARITY_GOOGLE_DISPLAY_NAME] = canonical;
    }
    return aliases;
}

export function compareCrossIdDocs(legacyDoc, modernDoc, options = {}) {
    if (!legacyDoc || !modernDoc) {
        throw new Error('Both documents are required');
    }
    const leftType = legacyDoc.type || '';
    const rightType = modernDoc.type || '';
    if (leftType !== rightType) {
        throw new Error(
            `Cannot compare different types: legacy is ${leftType || '(none)'}, modern is ${rightType || '(none)'}`
        );
    }

    const compared = compareDocs(legacyDoc, modernDoc, options);
    const idReferences = [];
    const operationalDiffs = [];
    for (const diff of compared.operationalDiffs) {
        if (isIdReferencePath(diff.path)) {
            idReferences.push(diff);
        } else {
            operationalDiffs.push(diff);
        }
    }

    const identity = {
        legacy: identitySnapshot(legacyDoc),
        modern: identitySnapshot(modernDoc)
    };
    identity.match = identityMatch(identity.legacy, identity.modern);

    const result = {
        legacyId: legacyDoc._id,
        modernId: modernDoc._id,
        ok: operationalDiffs.length === 0 && compared.extraKeys.length === 0,
        historyMatch: compared.historyDiffs.length === 0,
        identity,
        summary: {
            counts: {
                fields: operationalDiffs.length,
                history: compared.historyDiffs.length,
                extraKeys: compared.extraKeys.length,
                idReferences: idReferences.length
            },
            headline: ''
        },
        idReferences,
        operationalDiffs,
        historyDiffs: compared.historyDiffs,
        extraKeys: compared.extraKeys
    };
    result.summary.headline = formatHeadline(result);
    return result;
}

function trimId(value) {
    if (value == null) {
        return undefined;
    }
    const trimmed = String(value).trim();
    return trimmed || undefined;
}

function argValue(argv, flag) {
    const index = argv.indexOf(flag);
    if (index === -1) {
        return undefined;
    }
    return trimId(argv[index + 1]);
}

export function parseCompareIdsCli(argv = []) {
    const flagLegacy = argValue(argv, '--legacy');
    const flagModern = argValue(argv, '--modern');
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--legacy' || arg === '--modern') {
            i += 1;
            continue;
        }
        if (String(arg).startsWith('--')) {
            continue;
        }
        positionals.push(trimId(arg));
    }
    const legacyId = flagLegacy || positionals[0];
    const modernId = flagModern || positionals[1];
    if (!legacyId || !modernId) {
        throw new Error('Usage: npm run parity:docs -- --legacy <oldId> --modern <newId>');
    }
    return { legacyId, modernId };
}

async function getOrThrow(client, id, side) {
    try {
        return await client.get(id);
    } catch (error) {
        throw new Error(`${side} document ${id} was not found (${error.message})`);
    }
}

export async function runCompareIds(cli, { env = process.env, fetchImpl = fetch } = {}) {
    const { legacyId, modernId } = cli;
    const legacyUrl = env.PARITY_LEGACY_DB_URL;
    const modernUrl = env.PARITY_MODERN_DB_URL;
    if (!legacyUrl || !modernUrl) {
        throw new Error('Set PARITY_LEGACY_DB_URL and PARITY_MODERN_DB_URL in .env');
    }
    const { legacy, modern } = resolveParityCredentials(env, {
        requireLegacy: true,
        requireModern: true
    });
    const legacyRaw = createRawCouchClient({
        dbUrl: legacyUrl,
        user: legacy.user,
        pass: legacy.pass,
        fetchImpl
    });
    const modernRaw = createRawCouchClient({
        dbUrl: modernUrl,
        user: modern.user,
        pass: modern.pass,
        fetchImpl
    });
    const left = await getOrThrow(legacyRaw, legacyId, 'Legacy');
    const right = await getOrThrow(modernRaw, modernId, 'Modern');
    return compareCrossIdDocs(left, right, { actorAliases: actorAliases(env) });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
    return runCompareIds(parseCompareIdsCli(argv), { env });
}

const invokedDirectly = path.basename(String(process.argv[1] || '').replace(/\\/g, '/')) === 'compare-ids.mjs';
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
