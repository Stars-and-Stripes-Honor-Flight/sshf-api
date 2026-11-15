/**
 * Guards the repo copy of _design/basic (issue #165).
 *
 * The discovery test reads production code and stays green. The folder test
 * is red until the implementer seeds couchdb/design/basic/ from
 * https://github.com/shmakes/hf-basic master with only the views and lists
 * sshf-api still references. Do not copy unused hf-basic views (for example
 * admin_duplicates) or lists (for example accommodations-csv). None of the
 * referenced views have a reduce.js on hf-basic master; reduce.js is allowed
 * only as an optional sibling of map.js.
 *
 * This file does not import the deploy modules. It checks the tree directly:
 *   couchdb/design/basic/views/<view>/map.js
 *   couchdb/design/basic/lists/<list>.js
 * and nothing else at the top of that folder.
 *
 * A second guard covers _design/hf-app-review (issue #168). new_apps is not a
 * basic view. It is referenced by REVIEW_VIEW_PATH in routes/review-applications.js
 * and must live only under couchdb/design/hf-app-review, trimmed like couchapp
 * from https://github.com/shmakes/hf-app-review master (views/new_apps/map.js).
 */
import { expect } from 'chai';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecentActivityRequest } from '../models/recent_activity_request.js';
import { SearchRequest } from '../models/search_request.js';
import { UnpairedVeteranRequest } from '../models/unpaired_veteran_request.js';
import { WaitlistRequest } from '../models/waitlist_request.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const designRoot = join(repoRoot, 'couchdb', 'design', 'basic');

const REQUIRED_VIEWS = [
    'active_by_flight',
    'admin_recent_additions',
    'admin_recent_call_changes',
    'admin_recent_changes',
    'admin_recent_flight_changes',
    'admin_recent_pairing_changes',
    'all_by_flight_and_name',
    'all_by_name',
    'all_by_phone_number2',
    'all_by_status_and_name',
    'flight_assignment',
    'flight_pairings',
    'flights',
    'unpaired_veterans_by_last_name',
    'waitlist_guardians',
    'waitlist_veteran_groups',
    'waitlist_veterans',
    'waitlist_veterans_active'
];

const REQUIRED_LISTS = [
    'callcenterfollowup-csv',
    'flight-csv',
    'tourlead-csv'
];

function sorted(values) {
    return [...values].sort();
}

function walkSource(dir, files) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            walkSource(full, files);
        } else if (/\.(js|mjs)$/.test(entry)) {
            files.push(full);
        }
    }
    return files;
}

function readViewMap(source) {
    const block = source.match(/const VIEW_MAP = \{([\s\S]*?)\n\};/);
    expect(block, 'RecentActivityRequest.VIEW_MAP').to.not.equal(null);
    return Object.fromEntries([...block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map((match) => (
        [match[1], match[2]]
    )));
}

function discoverDesignReferences() {
    const views = new Set();
    const lists = new Set();

    const searchCases = [
        { phone_num: '5551234' },
        { status: 'Active', flight: 'All' },
        { status: 'All', flight: 'SSHF-Nov2024' },
        { status: 'All', flight: 'All' }
    ];
    for (const data of searchCases) {
        views.add(new SearchRequest(data).getViewName());
    }

    for (const type of ['veterans', 'guardians']) {
        views.add(new WaitlistRequest({ type }).getViewName());
    }

    const viewMap = readViewMap(readFileSync(join(repoRoot, 'models', 'recent_activity_request.js'), 'utf8'));
    for (const [type, name] of Object.entries(viewMap)) {
        expect(new RecentActivityRequest({ type }).getViewName()).to.equal(name);
        views.add(name);
    }

    expect(new UnpairedVeteranRequest({ paired: true }).getViewName()).to.equal(null);
    views.add(new UnpairedVeteranRequest({ paired: false }).getViewName());

    const files = [];
    for (const relative of ['routes', join('scripts', 'parity')]) {
        walkSource(join(repoRoot, relative), files);
    }
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/_design\/basic\/_view\/([A-Za-z0-9_]+)/g)) {
            views.add(match[1]);
        }
        for (const match of source.matchAll(/_design\/basic\/_list\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_]+)/g)) {
            lists.add(match[1]);
            views.add(match[2]);
        }
        for (const match of source.matchAll(/listName:\s*'([A-Za-z0-9_-]+)'/g)) {
            lists.add(match[1]);
        }
        for (const match of source.matchAll(/viewName:\s*'([A-Za-z0-9_]+)'/g)) {
            views.add(match[1]);
        }
        for (const match of source.matchAll(/readExactView\(\s*req\s*,\s*'([A-Za-z0-9_]+)'/g)) {
            views.add(match[1]);
        }
    }

    views.delete(null);
    views.delete(undefined);
    return { views: sorted(views), lists: sorted(lists) };
}

function nonEmpty(file) {
    return existsSync(file) && readFileSync(file, 'utf8').trim().length > 0;
}

describe('design doc reference guard', () => {
    it('derives the approved _design/basic names from production code', () => {
        const found = discoverDesignReferences();
        expect(found.views).to.deep.equal(REQUIRED_VIEWS);
        expect(found.lists).to.deep.equal(REQUIRED_LISTS);
        expect(found.views).to.not.include('new_apps');
        expect(found.views).to.not.include('admin_duplicates');
        expect(found.lists).to.not.include('accommodations-csv');
    });

    it('stores every referenced view and list, and nothing else, in couchdb/design/basic', () => {
        const found = discoverDesignReferences();
        const views = sorted(new Set([...REQUIRED_VIEWS, ...found.views]));
        const lists = sorted(new Set([...REQUIRED_LISTS, ...found.lists]));
        const problems = [];

        if (!existsSync(designRoot)) {
            problems.push(`missing directory ${designRoot}`);
        } else {
            const top = readdirSync(designRoot);
            for (const entry of top) {
                if (entry !== 'views' && entry !== 'lists') {
                    problems.push(`extra top-level entry ${join(designRoot, entry)}`);
                }
            }
            if (!top.includes('views')) {
                problems.push(`missing directory ${join(designRoot, 'views')}`);
            }
            if (!top.includes('lists')) {
                problems.push(`missing directory ${join(designRoot, 'lists')}`);
            }
        }

        const viewsDir = join(designRoot, 'views');
        if (existsSync(viewsDir)) {
            for (const name of readdirSync(viewsDir)) {
                const viewDir = join(viewsDir, name);
                if (!views.includes(name) || !statSync(viewDir).isDirectory()) {
                    problems.push(`extra view ${viewDir}`);
                    continue;
                }
                for (const entry of readdirSync(viewDir)) {
                    if (entry !== 'map.js' && entry !== 'reduce.js') {
                        problems.push(`extra view file ${join(viewDir, entry)}`);
                    }
                }
            }
        }

        const listsDir = join(designRoot, 'lists');
        if (existsSync(listsDir)) {
            for (const entry of readdirSync(listsDir)) {
                const listName = entry.endsWith('.js') ? entry.slice(0, -3) : entry;
                if (!lists.includes(listName) || !entry.endsWith('.js') || !statSync(join(listsDir, entry)).isFile()) {
                    problems.push(`extra list ${join(listsDir, entry)}`);
                }
            }
        }

        for (const name of views) {
            const mapPath = join(viewsDir, name, 'map.js');
            if (!nonEmpty(mapPath)) {
                problems.push(`empty or missing ${mapPath}`);
            }
            const reducePath = join(viewsDir, name, 'reduce.js');
            if (existsSync(reducePath) && !nonEmpty(reducePath)) {
                problems.push(`empty ${reducePath}`);
            }
        }
        for (const name of lists) {
            const listPath = join(listsDir, `${name}.js`);
            if (!nonEmpty(listPath)) {
                problems.push(`empty or missing ${listPath}`);
            }
        }

        expect(problems, problems.join('\n')).to.deep.equal([]);
    });
});

const reviewDesignRoot = join(repoRoot, 'couchdb', 'design', 'hf-app-review');
const newAppsFixture = join(repoRoot, 'test', 'fixtures', 'hf-app-review-new_apps.map.js');

function couchappTrim(text) {
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function designViewReferences() {
    const byDesign = new Map();
    const files = [];
    for (const relative of ['routes', join('scripts', 'parity')]) {
        walkSource(join(repoRoot, relative), files);
    }
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/_design\/([A-Za-z0-9_-]+)\/_view\/([A-Za-z0-9_]+)/g)) {
            const design = match[1];
            const view = match[2];
            if (!byDesign.has(design)) {
                byDesign.set(design, new Set());
            }
            byDesign.get(design).add(view);
        }
    }
    return byDesign;
}

describe('hf-app-review design doc reference guard', () => {
    it('finds new_apps on _design/hf-app-review and does not treat it as a basic view', () => {
        const source = readFileSync(join(repoRoot, 'routes', 'review-applications.js'), 'utf8');
        expect(source).to.match(/const REVIEW_VIEW_PATH = '_design\/hf-app-review\/_view\/new_apps'/);

        const byDesign = designViewReferences();
        expect(sorted(byDesign.keys())).to.deep.equal(['basic', 'hf-app-review']);
        expect(sorted(byDesign.get('hf-app-review'))).to.deep.equal(['new_apps']);
        expect(sorted(byDesign.get('basic'))).to.not.include('new_apps');
        for (const name of byDesign.get('basic')) {
            expect(REQUIRED_VIEWS, name).to.include(name);
        }
        expect(existsSync(join(designRoot, 'views', 'new_apps'))).to.equal(false);
    });

    it('stores new_apps, and nothing else, in couchdb/design/hf-app-review', () => {
        const expectedMap = couchappTrim(readFileSync(newAppsFixture, 'utf8'));
        const byDesign = designViewReferences();
        const problems = [];
        const views = sorted(byDesign.get('hf-app-review') || []);
        if (!views.includes('new_apps')) {
            problems.push('production code does not reference _design/hf-app-review/_view/new_apps');
        }

        if (!existsSync(reviewDesignRoot)) {
            problems.push(`missing directory ${reviewDesignRoot}`);
        } else {
            for (const entry of readdirSync(reviewDesignRoot)) {
                if (entry !== 'views') {
                    problems.push(`extra top-level entry ${join(reviewDesignRoot, entry)}`);
                }
            }
        }

        const viewsDir = join(reviewDesignRoot, 'views');
        if (existsSync(viewsDir)) {
            for (const name of readdirSync(viewsDir)) {
                const viewDir = join(viewsDir, name);
                if (!views.includes(name) || !statSync(viewDir).isDirectory()) {
                    problems.push(`extra view ${viewDir}`);
                    continue;
                }
                for (const entry of readdirSync(viewDir)) {
                    if (entry !== 'map.js') {
                        problems.push(`extra view file ${join(viewDir, entry)}`);
                    }
                }
            }
        }

        for (const name of views) {
            const mapPath = join(viewsDir, name, 'map.js');
            if (!nonEmpty(mapPath)) {
                problems.push(`empty or missing ${mapPath}`);
                continue;
            }
            const actual = couchappTrim(readFileSync(mapPath, 'utf8'));
            if (name === 'new_apps' && actual !== expectedMap) {
                problems.push(
                    `${mapPath} is not views/new_apps/map.js from hf-app-review master `
                    + 'after couchapp trim (normalize CR LF to LF, then strip)'
                );
            }
        }

        const basicNewApps = join(designRoot, 'views', 'new_apps');
        if (existsSync(basicNewApps)) {
            problems.push(`new_apps must not be stored in ${basicNewApps}`);
        }

        expect(problems, problems.join('\n')).to.deep.equal([]);
    });
});
