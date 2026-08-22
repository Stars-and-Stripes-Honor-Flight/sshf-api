function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

const FLAG_KEYS = new Set([
    'usesCane',
    'usesWalker',
    'usesWheelchair',
    'usesScooter',
    'requiresOxygen',
    'examRequired',
    'isWheelchairBound',
    'form',
    'release',
    'nofly',
    'vaccinated',
    'mediaWaiver',
    'infection_test',
    'waiver'
]);

function applyActorAlias(text, aliases) {
    if (!aliases || typeof text !== 'string') {
        return text;
    }
    let out = text;
    for (const [from, to] of Object.entries(aliases)) {
        if (out === from) {
            out = to;
            continue;
        }
        out = out.split(`by: ${from}`).join(`by: ${to}`);
    }
    return out;
}

function coerceValue(path, value) {
    const last = path.split('.').pop();
    if (last === 'state' && typeof value === 'string') {
        return value.toUpperCase();
    }
    if (FLAG_KEYS.has(last) && (value === 0 || value === 1 || value === '0' || value === '1')) {
        return value === 1 || value === '1';
    }
    if (typeof value === 'string' && last !== 'change') {
        return value.trim();
    }
    return value;
}

function applyDefaults(doc) {
    if (doc.flight && typeof doc.flight === 'object') {
        if (doc.flight.bus == null || doc.flight.bus === '') {
            doc.flight.bus = 'None';
        }
        if (doc.flight.id == null || doc.flight.id === '') {
            doc.flight.id = 'None';
        }
    }
    if (doc.call && typeof doc.call === 'object') {
        if (doc.call.how_heard_about == null || doc.call.how_heard_about === '') {
            doc.call.how_heard_about = 'Unknown';
        }
    }
}

function walkNormalize(node, path, options) {
    if (Array.isArray(node)) {
        if (path === 'history' || path.endsWith('.history')) {
            for (const entry of node) {
                if (entry && typeof entry === 'object') {
                    delete entry.id;
                    if (typeof entry.change === 'string') {
                        entry.change = applyActorAlias(entry.change, options.actorAliases);
                    }
                }
            }
            return;
        }
        node.forEach((item, index) => {
            walkNormalize(item, `${path}[${index}]`, options);
        });
        return;
    }
    if (!node || typeof node !== 'object') {
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        const childPath = path ? `${path}.${key}` : key;
        if (value && typeof value === 'object') {
            walkNormalize(value, childPath, options);
        } else {
            node[key] = coerceValue(childPath, value);
        }
    }
}

export function normalizeDoc(doc, options = {}) {
    if (doc == null || typeof doc !== 'object') {
        return doc;
    }
    const out = cloneJson(doc);
    delete out._rev;
    if (out.metadata && typeof out.metadata === 'object') {
        delete out.metadata.updated_at;
        if (typeof out.metadata.updated_by === 'string') {
            out.metadata.updated_by = applyActorAlias(out.metadata.updated_by, options.actorAliases);
        }
    }
    applyDefaults(out);
    walkNormalize(out, '', options);
    return out;
}
