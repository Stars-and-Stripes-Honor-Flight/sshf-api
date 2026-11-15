import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MaintenanceError } from '../maintenance/errors.mjs';

export const DESIGN_DOC_ID = '_design/basic';

const ALLOWED_ROOT = new Set(['views', 'lists']);

function normalizeNewlines(text) {
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function prepareSource(text) {
    return normalizeNewlines(text).trim();
}

function assertNonEmpty(text, label) {
    if (typeof text !== 'string' || text.length === 0 || !/\S/.test(text)) {
        throw new MaintenanceError(`Design source ${label} is empty.`, { code: 'INVALID_SOURCE' });
    }
}

function readSource(fs, filePath, label) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        throw new MaintenanceError(`Design source ${label} is missing.`, { code: 'INVALID_SOURCE' });
    }
    const prepared = prepareSource(raw);
    assertNonEmpty(prepared, label);
    return prepared;
}

function readdirOrMissing(fs, dir) {
    try {
        return fs.readdirSync(dir);
    } catch {
        throw new MaintenanceError('Design source directory is missing.', { code: 'INVALID_SOURCE' });
    }
}

function inspectRoot(sourceDir, fs, pathImpl) {
    const entries = readdirOrMissing(fs, sourceDir);
    for (const entry of entries) {
        if (!ALLOWED_ROOT.has(entry)) {
            throw new MaintenanceError(`Unexpected design source entry: ${entry}`, { code: 'INVALID_SOURCE' });
        }
        const full = pathImpl.join(sourceDir, entry);
        if (!fs.statSync(full).isDirectory()) {
            throw new MaintenanceError(`Unexpected design source entry: ${entry}`, { code: 'INVALID_SOURCE' });
        }
    }
}

function readViews(sourceDir, fs, pathImpl) {
    const viewsDir = pathImpl.join(sourceDir, 'views');
    let viewNames;
    try {
        viewNames = fs.readdirSync(viewsDir).sort();
    } catch {
        throw new MaintenanceError('Design source views directory is missing.', { code: 'INVALID_SOURCE' });
    }
    if (viewNames.length === 0) {
        throw new MaintenanceError('Design source views directory is empty.', { code: 'INVALID_SOURCE' });
    }
    const views = {};
    for (const name of viewNames) {
        const viewDir = pathImpl.join(viewsDir, name);
        if (!fs.statSync(viewDir).isDirectory()) {
            throw new MaintenanceError(`Unexpected design source entry: ${name}`, { code: 'INVALID_SOURCE' });
        }
        const files = fs.readdirSync(viewDir).sort();
        for (const file of files) {
            if (file !== 'map.js' && file !== 'reduce.js') {
                throw new MaintenanceError(`Unexpected design source entry: ${file}`, { code: 'INVALID_SOURCE' });
            }
        }
        const mapPath = pathImpl.join(viewDir, 'map.js');
        if (!files.includes('map.js')) {
            throw new MaintenanceError(`Design source views/${name} is missing map.js.`, { code: 'INVALID_SOURCE' });
        }
        const map = readSource(fs, mapPath, `views/${name}`);
        const view = { map };
        if (files.includes('reduce.js')) {
            view.reduce = readSource(fs, pathImpl.join(viewDir, 'reduce.js'), `views/${name}/reduce.js`);
        }
        views[name] = view;
    }
    return views;
}

function readLists(sourceDir, fs, pathImpl, { required = true } = {}) {
    const listsDir = pathImpl.join(sourceDir, 'lists');
    let listFiles;
    try {
        listFiles = fs.readdirSync(listsDir).sort();
    } catch {
        if (!required) {
            return undefined;
        }
        throw new MaintenanceError('Design source lists directory is missing.', { code: 'INVALID_SOURCE' });
    }
    if (listFiles.length === 0) {
        throw new MaintenanceError('Design source lists directory is empty.', { code: 'INVALID_SOURCE' });
    }
    const lists = {};
    for (const file of listFiles) {
        if (!file.endsWith('.js')) {
            throw new MaintenanceError(`Unexpected design source entry: ${file}`, { code: 'INVALID_SOURCE' });
        }
        const full = pathImpl.join(listsDir, file);
        if (!fs.statSync(full).isFile()) {
            throw new MaintenanceError(`Unexpected design source entry: ${file}`, { code: 'INVALID_SOURCE' });
        }
        const name = file.slice(0, -3);
        lists[name] = readSource(fs, full, `lists/${name}`);
    }
    return lists;
}

function designDocId(design) {
    return design === 'hf-app-review' ? '_design/hf-app-review' : DESIGN_DOC_ID;
}

export function buildDesignDoc(
    sourceDir,
    { fs = { readdirSync, statSync, readFileSync }, pathImpl = path, design = 'basic' } = {}
) {
    inspectRoot(sourceDir, fs, pathImpl);
    const views = readViews(sourceDir, fs, pathImpl);
    const listsRequired = design !== 'hf-app-review';
    const lists = readLists(sourceDir, fs, pathImpl, { required: listsRequired });
    const doc = {
        _id: designDocId(design),
        language: 'javascript',
        views
    };
    if (lists !== undefined) {
        doc.lists = lists;
    }
    return doc;
}