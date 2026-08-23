import { normalizeDoc } from './normalize.mjs';

function isHistoryPath(path) {
    return path === 'history' || path.endsWith('.history');
}

function diffWalk(left, right, path, buckets) {
    const leftIsObj = left !== null && typeof left === 'object';
    const rightIsObj = right !== null && typeof right === 'object';

    if (Array.isArray(left) || Array.isArray(right)) {
        if (isHistoryPath(path)) {
            const leftChanges = (Array.isArray(left) ? left : []).map((entry) => entry?.change);
            const rightChanges = (Array.isArray(right) ? right : []).map((entry) => entry?.change);
            if (JSON.stringify(leftChanges) !== JSON.stringify(rightChanges)) {
                buckets.historyDiffs.push({
                    path,
                    left: leftChanges.join('\n'),
                    right: rightChanges.join('\n')
                });
            }
            return;
        }
        const max = Math.max(
            Array.isArray(left) ? left.length : 0,
            Array.isArray(right) ? right.length : 0
        );
        for (let i = 0; i < max; i++) {
            diffWalk(left?.[i], right?.[i], `${path}[${i}]`, buckets);
        }
        return;
    }

    if (leftIsObj && rightIsObj && !Array.isArray(left) && !Array.isArray(right)) {
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        for (const key of keys) {
            const childPath = path ? `${path}.${key}` : key;
            const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
            const hasRight = Object.prototype.hasOwnProperty.call(right, key);
            if (hasLeft && !hasRight) {
                buckets.extraKeys.push({ side: 'left', path: childPath });
                continue;
            }
            if (hasRight && !hasLeft) {
                buckets.extraKeys.push({ side: 'right', path: childPath });
                continue;
            }
            diffWalk(left[key], right[key], childPath, buckets);
        }
        return;
    }

    if (left !== right) {
        buckets.operationalDiffs.push({ path: path || '(root)', left, right });
    }
}

export function compareDocs(left, right, options = {}) {
    const a = normalizeDoc(left, options);
    const b = normalizeDoc(right, options);
    const buckets = {
        operationalDiffs: [],
        historyDiffs: [],
        extraKeys: []
    };
    diffWalk(a, b, '', buckets);
    return {
        ok: buckets.operationalDiffs.length === 0 && buckets.historyDiffs.length === 0,
        operationalDiffs: buckets.operationalDiffs,
        historyDiffs: buckets.historyDiffs,
        extraKeys: buckets.extraKeys,
        pairingGraphDiffs: []
    };
}

export function pairingEdges(docsById) {
    const edges = [];
    for (const doc of Object.values(docsById)) {
        if (!doc) {
            continue;
        }
        if (doc.type === 'Veteran' && doc.guardian?.id) {
            edges.push(`vet:${doc._id}->grd:${doc.guardian.id}`);
        }
        if (doc.type === 'Guardian') {
            for (const pairing of doc.veteran?.pairings || []) {
                if (pairing?.id) {
                    edges.push(`grd:${doc._id}->vet:${pairing.id}`);
                }
            }
        }
    }
    return edges.sort();
}

export function compareDocMaps(leftMap, rightMap, { ids, ...options } = {}) {
    const selected = ids || [...new Set([...Object.keys(leftMap || {}), ...Object.keys(rightMap || {})])];
    const operationalDiffs = [];
    const historyDiffs = [];
    const extraKeys = [];

    for (const id of selected) {
        const left = leftMap?.[id];
        const right = rightMap?.[id];
        if (left == null || right == null) {
            operationalDiffs.push({
                path: `_id:${id}`,
                left: left ? 'present' : 'missing',
                right: right ? 'present' : 'missing'
            });
            continue;
        }
        const result = compareDocs(left, right, options);
        for (const diff of result.operationalDiffs) {
            operationalDiffs.push({ ...diff, path: `${id}.${diff.path}` });
        }
        for (const diff of result.historyDiffs) {
            historyDiffs.push({ ...diff, path: `${id}.${diff.path}` });
        }
        for (const extra of result.extraKeys) {
            extraKeys.push({ ...extra, path: `${id}.${extra.path}` });
        }
    }

    const leftSlice = Object.fromEntries(selected.map((id) => [id, leftMap?.[id]]));
    const rightSlice = Object.fromEntries(selected.map((id) => [id, rightMap?.[id]]));
    const leftEdges = pairingEdges(leftSlice);
    const rightEdges = pairingEdges(rightSlice);
    const pairingGraphDiffs = [];
    if (JSON.stringify(leftEdges) !== JSON.stringify(rightEdges)) {
        pairingGraphDiffs.push({ path: 'pairingGraph', left: leftEdges, right: rightEdges });
    }

    return {
        ok: operationalDiffs.length === 0 && historyDiffs.length === 0 && pairingGraphDiffs.length === 0,
        operationalDiffs,
        historyDiffs,
        extraKeys,
        pairingGraphDiffs
    };
}

export function compareScenario({
    beforeLeft,
    beforeRight,
    afterLeft,
    afterRight,
    ids,
    ...options
}) {
    const baseline = compareDocMaps(beforeLeft, beforeRight, { ids, ...options });
    if (!baseline.ok) {
        return { ...baseline, dirtyBaseline: true };
    }
    const after = compareDocMaps(afterLeft, afterRight, { ids, ...options });
    return { ...after, dirtyBaseline: false };
}
