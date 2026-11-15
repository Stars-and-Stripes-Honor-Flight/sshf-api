function normalizeNewlines(text) {
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sorted(values) {
    return [...values].sort();
}

function viewsEqual(repoView, liveView) {
    const repoKeys = new Set(Object.keys(repoView || {}));
    const liveKeys = new Set(Object.keys(liveView || {}));
    if (repoKeys.size !== liveKeys.size) {
        return false;
    }
    for (const key of repoKeys) {
        if (!liveKeys.has(key)) {
            return false;
        }
        if (key === 'map' || key === 'reduce') {
            if (normalizeNewlines(repoView[key]) !== normalizeNewlines(liveView[key])) {
                return false;
            }
        } else if (JSON.stringify(repoView[key]) !== JSON.stringify(liveView[key])) {
            return false;
        }
    }
    return true;
}

function listSignature(source) {
    return normalizeNewlines(source ?? '');
}

function compareViewNames(repoViews, liveViews) {
    const repoNames = new Set(Object.keys(repoViews || {}));
    const liveNames = new Set(Object.keys(liveViews || {}));
    const viewsAdded = sorted([...repoNames].filter((name) => !liveNames.has(name)));
    const viewsRemoved = sorted([...liveNames].filter((name) => !repoNames.has(name)));
    const viewsKept = [];
    const viewsChanged = [];
    for (const name of sorted([...repoNames].filter((name) => liveNames.has(name)))) {
        if (viewsEqual(repoViews[name], liveViews[name])) {
            viewsKept.push(name);
        } else {
            viewsChanged.push(name);
        }
    }
    return { viewsAdded, viewsChanged, viewsKept, viewsRemoved };
}

function compareListNames(repoLists, liveLists) {
    const repoNames = new Set(Object.keys(repoLists || {}));
    const liveNames = new Set(Object.keys(liveLists || {}));
    const listsAdded = sorted([...repoNames].filter((name) => !liveNames.has(name)));
    const listsRemoved = sorted([...liveNames].filter((name) => !repoNames.has(name)));
    const listsKept = [];
    const listsChanged = [];
    for (const name of sorted([...repoNames].filter((name) => liveNames.has(name)))) {
        if (listSignature(repoLists[name]) === listSignature(liveLists[name])) {
            listsKept.push(name);
        } else {
            listsChanged.push(name);
        }
    }
    return { listsAdded, listsChanged, listsKept, listsRemoved };
}

const REPO_KEYS = new Set(['_id', 'language', 'views', 'lists']);

const MAX_DIFF_SNIPPET = 120;

function truncateSnippet(text) {
    if (text === undefined) {
        return '(missing)';
    }
    const flattened = String(text).replace(/\t/g, ' ');
    if (flattened.length <= MAX_DIFF_SNIPPET) {
        return flattened;
    }
    return `${flattened.slice(0, MAX_DIFF_SNIPPET - 1)}…`;
}

function firstLineDifference(left, right) {
    const a = normalizeNewlines(left ?? '');
    const b = normalizeNewlines(right ?? '');
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const lineCount = Math.max(aLines.length, bLines.length);
    for (let index = 0; index < lineCount; index += 1) {
        if (aLines[index] !== bLines[index]) {
            return {
                line: index + 1,
                repo: aLines[index],
                live: bLines[index]
            };
        }
    }
    return null;
}

export function formatDesignFunctionDiffs(repoDoc, liveDoc, diff) {
    if (!liveDoc) {
        return [];
    }
    const lines = [];
    for (const name of diff.viewsChanged) {
        const repoView = repoDoc.views?.[name] ?? {};
        const liveView = liveDoc.views?.[name] ?? {};
        for (const field of ['map', 'reduce']) {
            if (repoView[field] === undefined && liveView[field] === undefined) {
                continue;
            }
            const delta = firstLineDifference(repoView[field], liveView[field]);
            if (delta) {
                lines.push(
                    `view ${name} ${field} line ${delta.line}: `
                    + `repo: ${truncateSnippet(delta.repo)} | live: ${truncateSnippet(delta.live)}`
                );
            }
        }
    }
    for (const name of diff.listsChanged) {
        const delta = firstLineDifference(repoDoc.lists?.[name], liveDoc.lists?.[name]);
        if (delta) {
            lines.push(
                `list ${name} line ${delta.line}: `
                + `repo: ${truncateSnippet(delta.repo)} | live: ${truncateSnippet(delta.live)}`
            );
        }
    }
    return lines;
}

export function diffDesignDocs(repoDoc, liveDoc) {
    if (liveDoc == null) {
        const views = compareViewNames(repoDoc.views, {});
        const lists = compareListNames(repoDoc.lists, {});
        return {
            equivalent: false,
            languageChanged: false,
            ...views,
            ...lists,
            keysRemoved: [],
            attachmentsRemoved: []
        };
    }

    const languageChanged = liveDoc.language !== 'javascript';
    const views = compareViewNames(repoDoc.views, liveDoc.views);
    const lists = compareListNames(repoDoc.lists, liveDoc.lists);

    const keysRemoved = sorted(
        Object.keys(liveDoc).filter((key) => !REPO_KEYS.has(key) && key !== '_rev')
    );
    const attachmentsRemoved = sorted(
        liveDoc._attachments && typeof liveDoc._attachments === 'object'
            ? Object.keys(liveDoc._attachments)
            : []
    );

    const equivalent = !languageChanged
        && views.viewsAdded.length === 0
        && views.viewsChanged.length === 0
        && views.viewsRemoved.length === 0
        && lists.listsAdded.length === 0
        && lists.listsChanged.length === 0
        && lists.listsRemoved.length === 0
        && keysRemoved.length === 0
        && attachmentsRemoved.length === 0;

    return {
        equivalent,
        languageChanged,
        ...views,
        ...lists,
        keysRemoved,
        attachmentsRemoved
    };
}