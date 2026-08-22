import { assertSafeAlignPair, isProductionDatabase } from './db-guards.mjs';

export async function alignDatabases({
    source,
    target,
    apply = false,
    fetchImpl = fetch,
    replicateEndpoint,
    headers = {}
} = {}) {
    assertSafeAlignPair({ source, target });
    const body = {
        source,
        target,
        create_target: false
    };
    if (!apply) {
        return { dryRun: true, body };
    }
    if (!replicateEndpoint) {
        throw new Error('replicateEndpoint is required when apply is true');
    }
    const response = await fetchImpl(replicateEndpoint, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.reason || payload.error || `Replication failed (${response.status})`);
    }
    return { dryRun: false, body, result: payload };
}

function originOf(dbUrl) {
    const url = new URL(dbUrl);
    return `${url.protocol}//${url.host}`;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
    const apply = argv.includes('--apply');
    const source = env.PARITY_SOURCE_URL || env.PARITY_LEGACY_DB_URL;
    const target = env.PARITY_TARGET_URL || env.PARITY_MODERN_DB_URL;
    if (!source || !target) {
        throw new Error('Set PARITY_SOURCE_URL and PARITY_TARGET_URL (legacy test → sshf-db-prd copy)');
    }
    if (isProductionDatabase(source) || isProductionDatabase(target)) {
        throw new Error('Parity align refuses production database hf');
    }
    const user = env.DB_USER;
    const pass = env.DB_PASS;
    const headers = {};
    if (user && pass) {
        headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }
    const replicateEndpoint = env.PARITY_REPLICATE_URL || `${originOf(source)}/_replicate`;
    return alignDatabases({
        source,
        target,
        apply,
        replicateEndpoint,
        headers
    });
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('align-dbs.mjs');
if (invokedDirectly) {
    main()
        .then((result) => {
            console.log(JSON.stringify({ ok: true, ...result, body: result.body }, null, 2));
            if (result.dryRun) {
                console.error('Dry run only. Pass --apply to replicate test onto sshf-db-prd.');
            }
        })
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
