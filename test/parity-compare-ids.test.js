import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    compareCrossIdDocs,
    identitySnapshot,
    parseCompareIdsCli
} from '../scripts/parity/compare-ids.mjs';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'Previous_App');

function loadFixture(name) {
    return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('parity cross-id document compare', () => {
    let veteranExample;
    let guardianExample;

    beforeEach(() => {
        veteranExample = loadFixture('Veteran_Data_Example.json');
        guardianExample = loadFixture('Guardian_Data_Example.json');
    });

    it('treats the same veteran as a field match when only document ids differ', () => {
        const left = JSON.parse(JSON.stringify(veteranExample));
        const right = JSON.parse(JSON.stringify(veteranExample));
        right._id = 'modern-veteran-id';
        right._rev = '99-different';
        right.guardian.id = 'modern-guardian-id';

        const result = compareCrossIdDocs(left, right);
        expect(result.identity.match).to.equal(true);
        expect(result.identity.legacy.type).to.equal('Veteran');
        expect(result.identity.legacy.name).to.include('Atkinson');
        expect(result.idReferences.some((diff) => diff.path === '_id')).to.equal(true);
        expect(result.idReferences.some((diff) => diff.path === 'guardian.id')).to.equal(true);
        expect(result.operationalDiffs).to.deep.equal([]);
        expect(result.ok).to.equal(true);
        expect(result.summary.counts.idReferences).to.be.at.least(2);
        expect(result.summary.counts.fields).to.equal(0);
    });

    it('treats guardian pairing ids as expected id references', () => {
        const left = JSON.parse(JSON.stringify(guardianExample));
        const right = JSON.parse(JSON.stringify(guardianExample));
        right._id = 'modern-guardian-id';
        right.veteran.pairings[0].id = 'modern-veteran-id';

        const result = compareCrossIdDocs(left, right);
        expect(result.identity.legacy.type).to.equal('Guardian');
        expect(result.idReferences.some((diff) => diff.path === 'veteran.pairings[0].id')).to.equal(true);
        expect(result.operationalDiffs).to.deep.equal([]);
        expect(result.ok).to.equal(true);
    });

    it('still reports real field mismatches in the operational list', () => {
        const left = JSON.parse(JSON.stringify(veteranExample));
        const right = JSON.parse(JSON.stringify(veteranExample));
        right._id = 'modern-veteran-id';
        right.flight.seat = '99Z';
        right.address.city = 'Middleton';

        const result = compareCrossIdDocs(left, right);
        expect(result.ok).to.equal(false);
        expect(result.operationalDiffs.map((diff) => diff.path)).to.include.members([
            'flight.seat',
            'address.city'
        ]);
        expect(result.summary.counts.fields).to.equal(2);
        expect(result.summary.headline).to.match(/2 field/);
    });

    it('keeps history diffs visible without mixing them into field diffs', () => {
        const left = {
            _id: 'legacy',
            type: 'Veteran',
            name: { first: 'Ted', last: 'Smith' },
            flight: {
                bus: 'None',
                history: [{ id: '1', change: 'changed seat from:  to: 19E by: Steve' }]
            }
        };
        const right = {
            _id: 'modern',
            type: 'Veteran',
            name: { first: 'Ted', last: 'Smith' },
            flight: {
                bus: 'None',
                history: [{ id: '2', change: 'changed seat from:  to: 19E by: Google User' }]
            }
        };

        const result = compareCrossIdDocs(left, right);
        expect(result.ok).to.equal(true);
        expect(result.historyMatch).to.equal(false);
        expect(result.historyDiffs).to.have.length(1);
        expect(result.summary.counts.history).to.equal(1);
    });

    it('builds an identity snapshot for name, dob, gender, and flight', () => {
        const snapshot = identitySnapshot(veteranExample);
        expect(snapshot.type).to.equal('Veteran');
        expect(snapshot.name).to.equal(
            [veteranExample.name.first, veteranExample.name.middle, veteranExample.name.last]
                .filter(Boolean)
                .join(' ')
        );
        expect(snapshot).to.have.property('birth_date');
        expect(snapshot).to.have.property('gender');
        expect(snapshot.flight).to.equal(veteranExample.flight.id);
    });

    it('throws when the two documents are different types', () => {
        expect(() => compareCrossIdDocs(veteranExample, guardianExample))
            .to.throw(/different types/);
    });

    it('parses --legacy and --modern flags and trims ids', () => {
        expect(parseCompareIdsCli([
            '--legacy', '  legacy-id  ',
            '--modern', 'modern-id'
        ])).to.deep.equal({ legacyId: 'legacy-id', modernId: 'modern-id' });
        expect(parseCompareIdsCli(['legacy-id', 'modern-id']))
            .to.deep.equal({ legacyId: 'legacy-id', modernId: 'modern-id' });
    });
});
