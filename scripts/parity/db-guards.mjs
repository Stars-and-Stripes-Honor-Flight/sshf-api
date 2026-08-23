const PRODUCTION_DB_NAMES = new Set(['hf']);
const LEGACY_TEST_HOSTS = new Set(['db.starsandstripeshonorflight.org']);

export function parseDbRef(urlOrName) {
    if (!urlOrName) {
        return { host: '', name: '' };
    }
    const trimmed = String(urlOrName).trim().replace(/\/+$/, '');
    if (!trimmed.includes('://')) {
        const parts = trimmed.split('/').filter(Boolean);
        return { host: '', name: (parts[parts.length - 1] || '').toLowerCase() };
    }
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    return {
        host: url.hostname.toLowerCase(),
        name: (parts[0] || '').toLowerCase()
    };
}

function joinDbUrl(dbUrl, dbName) {
    if (!dbUrl) {
        return dbName || '';
    }
    const trimmed = String(dbUrl).trim().replace(/\/+$/, '');
    if (!dbName) {
        return trimmed;
    }
    if (trimmed.endsWith(`/${dbName}`)) {
        return trimmed;
    }
    return `${trimmed}/${dbName}`;
}

export function isProductionDatabase(urlOrName) {
    const { name } = parseDbRef(urlOrName);
    return PRODUCTION_DB_NAMES.has(name);
}

export function isLegacyTestDatabase(dbUrl, dbName) {
    const combined = joinDbUrl(dbUrl, dbName);
    const parsed = parseDbRef(combined.includes('://') ? combined : dbUrl);
    let host = parsed.host;
    if (!host && dbUrl && String(dbUrl).includes('://')) {
        host = new URL(dbUrl).hostname.toLowerCase();
    }
    const name = (dbName || parsed.name || '').toLowerCase();
    return name === 'test' && LEGACY_TEST_HOSTS.has(host);
}

export function assertSafeAlignPair({ source, target } = {}) {
    if (isProductionDatabase(source) || isProductionDatabase(target)) {
        throw new Error('Parity align refuses production database hf');
    }
    if (isLegacyTestDatabase(target) || isLegacyTestDatabase(target, parseDbRef(target).name)) {
        throw new Error('Parity align refuses to overwrite living legacy test');
    }
}

export function assertSafeModernAdapterDb({ dbUrl, dbName } = {}) {
    const combined = joinDbUrl(dbUrl, dbName);
    if (
        isProductionDatabase(dbName) ||
        isProductionDatabase(dbUrl) ||
        isProductionDatabase(combined)
    ) {
        throw new Error('Parity modern adapter refuses production database hf');
    }
    if (isLegacyTestDatabase(dbUrl, dbName) || isLegacyTestDatabase(combined)) {
        throw new Error('Parity modern adapter refuses legacy test database; use sshf-db-prd');
    }
}
