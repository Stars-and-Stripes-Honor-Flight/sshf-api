export function resolveParityCredentials(env = {}, { requireLegacy = false, requireModern = false } = {}) {
    const legacy = {
        user: env.PARITY_LEGACY_DB_USER,
        pass: env.PARITY_LEGACY_DB_PASS
    };
    const modern = {
        user: env.PARITY_MODERN_DB_USER || env.DB_USER,
        pass: env.PARITY_MODERN_DB_PASS || env.DB_PASS
    };
    if (requireLegacy && (!legacy.user || !legacy.pass)) {
        throw new Error(
            'Set PARITY_LEGACY_DB_USER and PARITY_LEGACY_DB_PASS in .env for the old CouchDB. DB_USER/DB_PASS are the new sshf-db-prd credentials and will not work on the legacy host.'
        );
    }
    if (requireModern && (!modern.user || !modern.pass)) {
        throw new Error(
            'Set DB_USER and DB_PASS (or PARITY_MODERN_DB_USER / PARITY_MODERN_DB_PASS) in .env for the sshf-db-prd copy.'
        );
    }
    return { legacy, modern };
}
