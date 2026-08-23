import 'dotenv/config';
import { resolveParityCredentials } from './credentials.mjs';
import { assertSafeAlignPair, isProductionDatabase } from './db-guards.mjs';

function basicAuthHeader(user, pass) {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function withBasicAuth(url, creds) {
    if (!creds?.user || !creds?.pass) {
        return url;
    }
    return {
        url,
        headers: {
            Authorization: basicAuthHeader(creds.user, creds.pass)
        }
    };
}

function originOf(dbUrl) {
    const url = new URL(dbUrl);
    return `${url.protocol}//${url.host}`;
}

function redactEndpoint(endpoint) {
    if (!endpoint || typeof endpoint === 'string') {
        return endpoint;
    }
    const headers = { ...(endpoint.headers || {}) };
    if (headers.Authorization) {
        headers.Authorization = 'Basic <redacted>';
    }
    return { ...endpoint, headers };
}

export function redactReplicateBody(body) {
    return {
        ...body,
        source: redactEndpoint(body.source),
        target: redactEndpoint(body.target)
    };
}

export async function alignDatabases({
    source,
    target,
    apply = false,
    fetchImpl = fetch,
    replicateEndpoint,
    headers = {},
    sourceAuth,
    targetAuth
} = {}) {
    assertSafeAlignPair({ source, target });
    const body = {
        source: withBasicAuth(source, sourceAuth),
        target: withBasicAuth(target, targetAuth),
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
        const reason = payload.reason || payload.error || `Replication failed (${response.status})`;
        if (response.status === 401) {
            let host = replicateEndpoint;
            try {
                host = new URL(replicateEndpoint).host;
            } catch {
                // keep the raw endpoint when it is not a URL
            }
            throw new Error(
                `${reason}. POST ${host}/_replicate uses DB_USER/DB_PASS for the new CouchDB. The old database needs PARITY_LEGACY_DB_USER and PARITY_LEGACY_DB_PASS.`
            );
        }
        throw new Error(reason);
    }
    return { dryRun: false, body, result: payload };
}

export function buildAlignRequest(argv = [], env = {}) {
    const apply = argv.includes('--apply');
    const source = env.PARITY_SOURCE_URL || env.PARITY_LEGACY_DB_URL;
    const target = env.PARITY_TARGET_URL || env.PARITY_MODERN_DB_URL;
    if (!source || !target) {
        throw new Error(
            'Set PARITY_LEGACY_DB_URL and PARITY_MODERN_DB_URL (or PARITY_SOURCE_URL / PARITY_TARGET_URL) in .env (legacy test → sshf-db-prd copy)'
        );
    }
    if (isProductionDatabase(source) || isProductionDatabase(target)) {
        throw new Error('Parity align refuses production database hf');
    }
    const { legacy, modern } = resolveParityCredentials(env, {
        requireLegacy: apply,
        requireModern: apply
    });
    const headers = {};
    if (apply && modern.user && modern.pass) {
        headers.Authorization = basicAuthHeader(modern.user, modern.pass);
    }
    const replicateEndpoint = env.PARITY_REPLICATE_URL || `${originOf(target)}/_replicate`;
    return {
        apply,
        source,
        target,
        sourceAuth: apply ? legacy : undefined,
        targetAuth: apply ? modern : undefined,
        replicateEndpoint,
        headers
    };
}

export async function main(argv = process.argv.slice(2), env = process.env, { fetchImpl = fetch } = {}) {
    const request = buildAlignRequest(argv, env);
    return alignDatabases({
        ...request,
        fetchImpl
    });
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('align-dbs.mjs');
if (invokedDirectly) {
    main()
        .then((result) => {
            console.log(JSON.stringify({
                ok: true,
                ...result,
                body: redactReplicateBody(result.body)
            }, null, 2));
            if (result.dryRun) {
                console.error('Dry run only. Pass --apply to replicate test onto sshf-db-prd.');
            }
        })
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
