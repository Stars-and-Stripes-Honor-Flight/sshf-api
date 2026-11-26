/**
 * View-behavior contract for waitlist order (issue #179).
 *
 * Loads each repo map.js with a stubbed emit and sorts the rows the way
 * CouchDB would: the emitted key (CouchDB type order, strings with the
 * Unicode collation CouchDB documents), then the document _id. Tests assert
 * the resulting doc ids and who is emitted. They do not assert the key text.
 *
 * Both waitlist views run the same ordering matrix. Membership is the same
 * document set with a different expected id list per view, matching the
 * maps as they work today:
 *   waitlist_veterans_active — Active and flight.id "None" only
 *   waitlist_veterans — those plus Future-Fall, Future-Spring,
 *     and Future-PostRestriction
 *
 * Ordering fixtures are Active veterans with flight.id "None", so both views
 * emit every row and only the key order can differ.
 */
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const stringCollator = new Intl.Collator('en', {
    usage: 'sort',
    sensitivity: 'variant'
});

const VIEWS = [
    {
        name: 'waitlist_veterans_active',
        file: join(repoRoot, 'couchdb/design/basic/views/waitlist_veterans_active/map.js'),
        memberIds: ['mem-active']
    },
    {
        name: 'waitlist_veterans',
        file: join(repoRoot, 'couchdb/design/basic/views/waitlist_veterans/map.js'),
        memberIds: ['mem-active', 'mem-future-fall', 'mem-future-spring', 'mem-future-post']
    }
];

function couchTypeRank(value) {
    if (value === null) {
        return 0;
    }
    if (typeof value === 'boolean') {
        return 1;
    }
    if (typeof value === 'number') {
        return 2;
    }
    if (typeof value === 'string') {
        return 3;
    }
    if (Array.isArray(value)) {
        return 4;
    }
    if (typeof value === 'object') {
        return 5;
    }
    return 6;
}

function couchCompare(left, right) {
    const rankDifference = couchTypeRank(left) - couchTypeRank(right);
    if (rankDifference !== 0) {
        return rankDifference;
    }

    if (left === null) {
        return 0;
    }
    if (typeof left === 'boolean') {
        if (left === right) {
            return 0;
        }
        return left ? 1 : -1;
    }
    if (typeof left === 'number') {
        if (left < right) {
            return -1;
        }
        if (left > right) {
            return 1;
        }
        return 0;
    }
    if (typeof left === 'string') {
        return stringCollator.compare(left, right);
    }
    if (Array.isArray(left)) {
        const length = Math.min(left.length, right.length);
        for (let index = 0; index < length; index += 1) {
            const compared = couchCompare(left[index], right[index]);
            if (compared !== 0) {
                return compared;
            }
        }
        return left.length - right.length;
    }

    const leftKeys = Object.keys(left).sort((a, b) => stringCollator.compare(a, b));
    const rightKeys = Object.keys(right).sort((a, b) => stringCollator.compare(a, b));
    const length = Math.min(leftKeys.length, rightKeys.length);
    for (let index = 0; index < length; index += 1) {
        const keyCompared = stringCollator.compare(leftKeys[index], rightKeys[index]);
        if (keyCompared !== 0) {
            return keyCompared;
        }
        const valueCompared = couchCompare(left[leftKeys[index]], right[rightKeys[index]]);
        if (valueCompared !== 0) {
            return valueCompared;
        }
    }
    return leftKeys.length - rightKeys.length;
}

function normalizeCouchKey(key) {
    if (key === undefined) {
        return null;
    }
    return JSON.parse(JSON.stringify(key));
}

function runView(mapSource, docs) {
    const rows = [];
    let currentId = null;
    const context = createContext({
        emit(key, value) {
            rows.push({
                id: currentId,
                key: normalizeCouchKey(key),
                value
            });
        }
    });
    const mapFn = runInContext(`(${mapSource})`, context, { filename: 'map.js' });

    for (const doc of docs) {
        currentId = doc._id;
        try {
            mapFn(doc);
        } catch (error) {
            throw new Error(`map failed for ${doc._id}: ${error.message}`);
        }
    }

    rows.sort((left, right) => {
        const keyOrder = couchCompare(left.key, right.key);
        if (keyOrder !== 0) {
            return keyOrder;
        }
        return couchCompare(left.id, right.id);
    });
    return rows;
}

function orderedIds(mapSource, docs) {
    return runView(mapSource, [...docs].reverse()).map((row) => row.id);
}

function veteran(id, options = {}) {
    const flightId = Object.prototype.hasOwnProperty.call(options, 'flightId')
        ? options.flightId
        : 'None';
    const doc = {
        _id: id,
        type: options.type || 'Veteran',
        flight: {
            id: flightId,
            status: options.status || 'Active',
            group: options.group || ''
        }
    };

    if (Object.prototype.hasOwnProperty.call(options, 'vetType')) {
        if (options.vetType !== undefined) {
            doc.vet_type = options.vetType;
        }
    } else {
        doc.vet_type = 'WWII';
    }

    if (Object.prototype.hasOwnProperty.call(options, 'appDate')) {
        if (options.appDate !== undefined) {
            doc.app_date = options.appDate;
        }
    } else {
        doc.app_date = '2020-01-01';
    }

    return doc;
}

const ORDER_SCENARIOS = [
    {
        title: 'orders WWII, then Korea, then Vietnam, then every other conflict',
        docs: [
            veteran('wwii', { vetType: 'WWII', appDate: '2024-04-04' }),
            veteran('korea', { vetType: 'Korea', appDate: '2024-03-03' }),
            veteran('vietnam', { vetType: 'Vietnam', appDate: '2024-02-02' }),
            veteran('cold-war', { vetType: 'Cold War', appDate: '2010-01-01' })
        ],
        expectedIds: ['wwii', 'korea', 'vietnam', 'cold-war']
    },
    {
        title: 'sorts an older Cold War or Gulf War veteran after a newer Vietnam veteran',
        docs: [
            veteran('vietnam-newer', { vetType: 'Vietnam', appDate: '2024-11-01' }),
            veteran('cold-war-older', { vetType: 'Cold War', appDate: '1976-01-01' }),
            veteran('gulf-war-older', { vetType: 'Gulf War', appDate: '1991-01-17' })
        ],
        expectedIds: ['vietnam-newer', 'cold-war-older', 'gulf-war-older']
    },
    {
        title: 'sorts Afghanistan, Iraq, and Other with Cold War and Gulf War, after Vietnam',
        docs: [
            veteran('tier4-vietnam', { vetType: 'Vietnam', appDate: '2019-06-01' }),
            veteran('tier4-other', { vetType: 'Other', appDate: '2000-06-01' }),
            veteran('tier4-cold-war', { vetType: 'Cold War', appDate: '2001-01-01' }),
            veteran('tier4-afghanistan', { vetType: 'Afghanistan', appDate: '2002-01-01' }),
            veteran('tier4-gulf-war', { vetType: 'Gulf War', appDate: '2003-03-20' }),
            veteran('tier4-iraq', { vetType: 'Iraq', appDate: '2004-01-01' })
        ],
        expectedIds: [
            'tier4-vietnam',
            'tier4-other',
            'tier4-cold-war',
            'tier4-afghanistan',
            'tier4-gulf-war',
            'tier4-iraq'
        ]
    },
    {
        title: 'keeps a missing or blank vet_type in the WWII tier',
        docs: [
            veteran('type-null', { vetType: null, appDate: '2018-02-01' }),
            veteran('type-missing', { vetType: undefined, appDate: '2018-04-01' }),
            veteran('type-blank', { vetType: '', appDate: '2018-08-01' }),
            veteran('type-wwii', { vetType: 'WWII', appDate: '2019-01-01' }),
            veteran('type-korea', { vetType: 'Korea', appDate: '1955-07-27' })
        ],
        expectedIds: ['type-null', 'type-missing', 'type-blank', 'type-wwii', 'type-korea']
    },
    {
        title: 'sorts an unrecognized vet_type after Vietnam, with Cold War and the other later conflicts',
        docs: [
            veteran('unknown-wwii', { vetType: 'WWII', appDate: '2024-09-01' }),
            veteran('unknown-korea', { vetType: 'Korea', appDate: '1955-01-01' }),
            veteran('unknown-vietnam', { vetType: 'Vietnam', appDate: '2020-06-01' }),
            veteran('unknown-modern', { vetType: 'Modern', appDate: '2001-03-03' }),
            veteran('unknown-cold-war', { vetType: 'Cold War', appDate: '2008-08-08' }),
            veteran('unknown-ww2', { vetType: 'WW2', appDate: '2012-12-12' })
        ],
        expectedIds: [
            'unknown-wwii',
            'unknown-korea',
            'unknown-vietnam',
            'unknown-modern',
            'unknown-cold-war',
            'unknown-ww2'
        ]
    },
    {
        title: 'sorts a missing app_date last within its tier',
        docs: [
            veteran('app-wwii-early', { vetType: 'WWII', appDate: '1980-01-01' }),
            veteran('app-wwii-late', { vetType: 'WWII', appDate: '2030-12-31' }),
            veteran('app-wwii-missing', { vetType: 'WWII', appDate: undefined }),
            veteran('app-korea', { vetType: 'Korea', appDate: '1970-01-01' })
        ],
        expectedIds: ['app-wwii-early', 'app-wwii-late', 'app-wwii-missing', 'app-korea']
    },
    {
        title: 'breaks same-date ties by document _id',
        docs: [
            veteran('mmm-wwii', { vetType: 'WWII', appDate: '2016-06-06' }),
            veteran('zzz-wwii', { vetType: 'WWII', appDate: '2016-06-06' }),
            veteran('aaa-korea', { vetType: 'Korea', appDate: '2016-06-06' })
        ],
        expectedIds: ['mmm-wwii', 'zzz-wwii', 'aaa-korea']
    },
    {
        title: 'orders an earlier app_date first within a tier',
        docs: [
            veteran('date-b', { vetType: 'WWII', appDate: '2020-01-15' }),
            veteran('date-a', { vetType: 'WWII', appDate: '2020-12-01' }),
            veteran('date-0', { vetType: 'Korea', appDate: '1999-05-05' })
        ],
        expectedIds: ['date-b', 'date-a', 'date-0']
    }
];

const MEMBERSHIP_DOCS = [
    veteran('mem-active', { status: 'Active', flightId: 'None' }),
    veteran('mem-future-fall', { status: 'Future-Fall', flightId: 'None', vetType: 'Gulf War' }),
    veteran('mem-future-spring', { status: 'Future-Spring', flightId: 'None', vetType: 'Afghanistan' }),
    veteran('mem-future-post', { status: 'Future-PostRestriction', flightId: 'None', vetType: 'Other' }),
    veteran('mem-flown', { status: 'Flown', flightId: 'None' }),
    veteran('mem-removed', { status: 'Removed', flightId: 'None' }),
    veteran('mem-deceased', { status: 'Deceased', flightId: 'None' }),
    veteran('mem-assigned', { status: 'Active', flightId: 'SSHF-Nov2024' }),
    veteran('mem-future-assigned', { status: 'Future-Fall', flightId: 'SSHF-Nov2024' }),
    veteran('mem-empty-flight', { status: 'Active', flightId: '' }),
    veteran('mem-lower-none', { status: 'Active', flightId: 'none' }),
    veteran('mem-null-flight', { status: 'Active', flightId: null }),
    veteran('mem-guardian', { type: 'Guardian', status: 'Active', flightId: 'None' })
];

describe('CouchDB view row order', () => {
    it('orders rows by CouchDB collation of the key, then document _id', () => {
        const mapSource = [
            'function(doc) {',
            '  emit(doc.emitKey, null);',
            '}'
        ].join('\n');
        const docs = [
            { _id: 'k-null', emitKey: null },
            { _id: 'k-false', emitKey: false },
            { _id: 'k-true', emitKey: true },
            { _id: 'k-1', emitKey: 1 },
            { _id: 'k-2', emitKey: 2 },
            { _id: 'k-a', emitKey: 'a' },
            { _id: 'k-A', emitKey: 'A' },
            { _id: 'k-aa', emitKey: 'aa' },
            { _id: 'id-0', emitKey: 'b' },
            { _id: 'b', emitKey: 'case' },
            { _id: 'B', emitKey: 'case' },
            { _id: 'id-a', emitKey: 'tie' },
            { _id: 'id-b', emitKey: 'tie' },
            { _id: 'k-arr-a', emitKey: ['a'] },
            { _id: 'k-arr-ab', emitKey: ['a', 'b'] },
            { _id: 'k-arr-b', emitKey: ['b'] }
        ];

        expect(orderedIds(mapSource, docs)).to.deep.equal([
            'k-null',
            'k-false',
            'k-true',
            'k-1',
            'k-2',
            'k-a',
            'k-A',
            'k-aa',
            'id-0',
            'b',
            'B',
            'id-a',
            'id-b',
            'k-arr-a',
            'k-arr-ab',
            'k-arr-b'
        ]);
    });
});

describe('waitlist veteran views', () => {
    for (const view of VIEWS) {
        describe(view.name, () => {
            const mapSource = readFileSync(view.file, 'utf8');

            for (const scenario of ORDER_SCENARIOS) {
                it(scenario.title, () => {
                    expect(orderedIds(mapSource, scenario.docs)).to.deep.equal(scenario.expectedIds);
                });
            }

            it('emits only the veterans that belong on this waitlist', () => {
                const ids = runView(mapSource, MEMBERSHIP_DOCS).map((row) => row.id);
                expect(ids.slice().sort()).to.deep.equal(view.memberIds.slice().sort());
            });
        });
    }
});
