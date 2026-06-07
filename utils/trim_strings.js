const SKIP_KEYS = new Set(['history']);

export function trimIfString(value) {
    return typeof value === 'string' ? value.trim() : value;
}

export function trimStringValues(value, parentKey = null) {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        if (parentKey && SKIP_KEYS.has(parentKey)) {
            return value;
        }
        return value.map(item => trimStringValues(item));
    }

    if (typeof value === 'object') {
        const result = {};
        for (const [key, child] of Object.entries(value)) {
            if (SKIP_KEYS.has(key)) {
                result[key] = child;
            } else {
                result[key] = trimStringValues(child, key);
            }
        }
        return result;
    }

    return value;
}
