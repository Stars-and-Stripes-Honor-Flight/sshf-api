import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeDoc } from '../scripts/parity/normalize.mjs';
import {
    compareDocs,
    compareDocMaps,
    compareScenario
} from '../scripts/parity/compare-docs.mjs';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'Previous_App');

function loadFixture(name) {
    return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('parity normalize and compare', () => {
    let veteranExample;
    let guardianExample;

    beforeEach(() => {
        veteranExample = loadFixture('Veteran_Data_Example.json');
        guardianExample = loadFixture('Guardian_Data_Example.json');
    });

    describe('normalizeDoc', () => {
        it('strips _rev, metadata.updated_at, and history entry ids', () => {
            const clone = JSON.parse(JSON.stringify(veteranExample));
            clone.metadata = { ...(clone.metadata || {}), updated_at: '2026-08-22T18:00:00Z', updated_by: 'Steve' };
            const normalized = normalizeDoc(clone);

            expect(normalized).to.not.have.property('_rev');
            expect(normalized.metadata).to.not.have.property('updated_at');
            expect(normalized.flight.history[0]).to.not.have.property('id');
            expect(normalized.flight.history[0].change).to.equal(veteranExample.flight.history[0].change);
        });

        it('does not use Veteran constructor defaults that would hide missing keys', () => {
            const sparse = { _id: 'abc', type: 'Veteran', name: { first: 'Ted' } };
            const normalized = normalizeDoc(sparse);
            expect(normalized.flight).to.equal(undefined);
            expect(normalized.shirt).to.equal(undefined);
        });

        it('coerces medical 0/1 flags to booleans and uppercases state', () => {
            const doc = {
                _id: 'v1',
                type: 'Veteran',
                address: { state: 'wi' },
                medical: { usesCane: 1, usesWalker: 0 }
            };
            const normalized = normalizeDoc(doc);
            expect(normalized.address.state).to.equal('WI');
            expect(normalized.medical.usesCane).to.equal(true);
            expect(normalized.medical.usesWalker).to.equal(false);
        });

        it('default-fills missing flight.bus, flight.id, and call.how_heard_about', () => {
            const doc = {
                _id: 'v1',
                type: 'Veteran',
                flight: { status: 'Active' },
                call: {}
            };
            const normalized = normalizeDoc(doc);
            expect(normalized.flight.bus).to.equal('None');
            expect(normalized.flight.id).to.equal('None');
            expect(normalized.call.how_heard_about).to.equal('Unknown');
        });

        it('rewrites history by: clauses using actor aliases', () => {
            const doc = {
                _id: 'v1',
                type: 'Veteran',
                metadata: { updated_by: 'Google Person' },
                flight: {
                    history: [{ id: 't1', change: 'changed bus from: A to: B by: Google Person' }]
                }
            };
            const normalized = normalizeDoc(doc, {
                actorAliases: { 'Google Person': 'harness-user' }
            });
            expect(normalized.metadata.updated_by).to.equal('harness-user');
            expect(normalized.flight.history[0].change).to.equal(
                'changed bus from: A to: B by: harness-user'
            );
        });
    });

    describe('compareDocs', () => {
        it('treats two copies of the Previous_App veteran example as equal after ignore rules', () => {
            const left = JSON.parse(JSON.stringify(veteranExample));
            const right = JSON.parse(JSON.stringify(veteranExample));
            right._rev = '99-different';
            right.metadata = { ...(right.metadata || {}), updated_at: '2099-01-01T00:00:00Z' };
            right.flight.history = right.flight.history.map((entry, i) => ({
                ...entry,
                id: `other-${i}`
            }));

            const result = compareDocs(left, right);
            expect(result.ok).to.equal(true);
            expect(result.operationalDiffs).to.deep.equal([]);
            expect(result.historyDiffs).to.deep.equal([]);
        });

        it('fails exact history comparison when Veteran PUT omits from:/to: colons', () => {
            const evently = {
                _id: 'v1',
                type: 'Veteran',
                flight: {
                    bus: 'Bravo3',
                    history: [{
                        id: '2026-01-01T00:00:00Z',
                        change: 'changed bus from: Alpha1 to: Bravo3 by: harness-user'
                    }]
                }
            };
            const veteranPut = {
                _id: 'v1',
                type: 'Veteran',
                flight: {
                    bus: 'Bravo3',
                    history: [{
                        id: '2026-01-01T00:00:01Z',
                        change: 'changed bus from Alpha1 to Bravo3 by: harness-user'
                    }]
                }
            };

            const result = compareDocs(evently, veteranPut);
            expect(result.ok).to.equal(false);
            expect(result.historyDiffs).to.not.be.empty;
            expect(result.historyDiffs[0].left).to.include('from:');
            expect(result.historyDiffs[0].right).to.not.include('from:');
        });

        it('reports extra keys without treating them as operational field mismatches', () => {
            const left = { _id: 'v1', type: 'Veteran', flight: { bus: 'None' }, legacyOnly: 'x' };
            const right = { _id: 'v1', type: 'Veteran', flight: { bus: 'None' } };
            const result = compareDocs(left, right);
            expect(result.operationalDiffs).to.deep.equal([]);
            expect(result.extraKeys).to.deep.include.members([
                { side: 'left', path: 'legacyOnly' }
            ]);
            expect(result.ok).to.equal(true);
        });

        it('reports operational diffs for current field mismatches', () => {
            const left = { _id: 'v1', type: 'Veteran', flight: { status_note: 'a', bus: 'None' } };
            const right = { _id: 'v1', type: 'Veteran', flight: { status_note: 'b', bus: 'None' } };
            const result = compareDocs(left, right);
            expect(result.ok).to.equal(false);
            expect(result.operationalDiffs.some((d) => d.path === 'flight.status_note')).to.equal(true);
        });
    });

    describe('compareDocMaps pairing graph', () => {
        it('passes when veteran guardian.id matches guardian veteran.pairings', () => {
            const result = compareDocMaps(
                { [veteranExample._id]: veteranExample, [guardianExample._id]: guardianExample },
                {
                    [veteranExample._id]: JSON.parse(JSON.stringify(veteranExample)),
                    [guardianExample._id]: JSON.parse(JSON.stringify(guardianExample))
                }
            );
            expect(result.ok).to.equal(true);
            expect(result.pairingGraphDiffs).to.deep.equal([]);
        });

        it('fails when pairing edges differ', () => {
            const leftVet = JSON.parse(JSON.stringify(veteranExample));
            const rightVet = JSON.parse(JSON.stringify(veteranExample));
            const rightGrd = JSON.parse(JSON.stringify(guardianExample));
            rightVet.guardian.id = '';
            rightVet.guardian.name = '';
            rightGrd.veteran.pairings = [];

            const result = compareDocMaps(
                { [leftVet._id]: leftVet, [guardianExample._id]: guardianExample },
                { [rightVet._id]: rightVet, [rightGrd._id]: rightGrd }
            );
            expect(result.ok).to.equal(false);
            expect(result.pairingGraphDiffs).to.not.be.empty;
        });
    });

    describe('compareScenario', () => {
        it('fails as dirty baseline when pre-op snapshots already differ', () => {
            const beforeLeft = { v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'old' } } };
            const beforeRight = { v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'drift' } } };
            const afterLeft = { v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'new' } } };
            const afterRight = { v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'new' } } };

            const result = compareScenario({
                beforeLeft,
                beforeRight,
                afterLeft,
                afterRight,
                ids: ['v1']
            });
            expect(result.ok).to.equal(false);
            expect(result.dirtyBaseline).to.equal(true);
        });

        it('compares only the scenario ids after a clean baseline', () => {
            const untouched = { _id: 'other', type: 'Veteran', flight: { status_note: 'noise' } };
            const before = {
                v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'old', bus: 'None' } },
                other: untouched
            };
            const afterLeft = {
                v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'new', bus: 'None' } },
                other: { ...untouched, flight: { status_note: 'legacy-noise' } }
            };
            const afterRight = {
                v1: { _id: 'v1', type: 'Veteran', flight: { status_note: 'new', bus: 'None' } },
                other: { ...untouched, flight: { status_note: 'modern-noise' } }
            };

            const result = compareScenario({
                beforeLeft: before,
                beforeRight: before,
                afterLeft,
                afterRight,
                ids: ['v1']
            });
            expect(result.ok).to.equal(true);
            expect(result.dirtyBaseline).to.equal(false);
        });
    });
});
