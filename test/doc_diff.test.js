import { expect } from 'chai';
import {
    COMPACTION_WARNING,
    DocDiffError,
    DocDiffRequest,
    buildDiffResponse,
    buildRevisionList,
    diffDocuments,
    resolveRevisionPair
} from '../models/doc_diff.js';

const REV_CURRENT = '5-aaa111aaa111aaa111aaa111aaa111aa';
const REV_PREVIOUS = '4-bbb222bbb222bbb222bbb222bbb222bb';
const REV_MISSING = '3-ccc333ccc333ccc333ccc333ccc333cc';
const REV_DELETED = '2-ddd444ddd444ddd444ddd444ddd444dd';
const REV_OLDER = '1-eee555eee555eee555eee555eee555ee';

const revsInfo = [
    { rev: REV_CURRENT, status: 'available' },
    { rev: REV_PREVIOUS, status: 'available' },
    { rev: REV_MISSING, status: 'missing' },
    { rev: REV_DELETED, status: 'deleted' },
    { rev: REV_OLDER, status: 'available' }
];

describe('DocDiffRequest', () => {
    it('should treat omitted from and to as undefined defaults', () => {
        const request = new DocDiffRequest({});
        expect(request.from).to.equal(undefined);
        expect(request.to).to.equal(undefined);
    });

    it('should accept current and previous aliases', () => {
        const request = new DocDiffRequest({ from: 'previous', to: 'current' });
        expect(request.from).to.equal('previous');
        expect(request.to).to.equal('current');
    });

    it('should accept explicit CouchDB revision tokens', () => {
        const request = new DocDiffRequest({ from: REV_PREVIOUS, to: REV_CURRENT });
        expect(request.from).to.equal(REV_PREVIOUS);
        expect(request.to).to.equal(REV_CURRENT);
    });

    it('should treat empty from and to as omitted', () => {
        const request = new DocDiffRequest({ from: '', to: '   ' });
        expect(request.from).to.equal(undefined);
        expect(request.to).to.equal(undefined);
    });

    it('should reject an invalid from revision', () => {
        expect(() => new DocDiffRequest({ from: 'not-a-rev' })).to.throw(DocDiffError)
            .that.has.property('status', 400);
        expect(() => new DocDiffRequest({ from: 'not-a-rev' })).to.throw('from');
    });

    it('should reject an invalid to revision', () => {
        expect(() => new DocDiffRequest({ to: '1' })).to.throw(DocDiffError)
            .that.has.property('status', 400);
    });
});

describe('buildRevisionList', () => {
    it('should return revision metadata without the document body', () => {
        const result = buildRevisionList({
            _id: 'veteran-123',
            _rev: REV_CURRENT,
            _revs_info: revsInfo,
            status: 'Active',
            name: 'John'
        });

        expect(result).to.deep.equal({
            id: 'veteran-123',
            currentRev: REV_CURRENT,
            revisions: revsInfo,
            availableCount: 3,
            warning: COMPACTION_WARNING
        });
        expect(result).to.not.have.property('status');
        expect(result).to.not.have.property('name');
    });

    it('should omit the warning when every revision is available', () => {
        const result = buildRevisionList({
            _id: 'doc-1',
            _rev: REV_CURRENT,
            _revs_info: [
                { rev: REV_CURRENT, status: 'available' },
                { rev: REV_PREVIOUS, status: 'available' }
            ]
        });

        expect(result.availableCount).to.equal(2);
        expect(result).to.not.have.property('warning');
    });

    it('should handle a missing _revs_info array', () => {
        const result = buildRevisionList({
            _id: 'doc-1',
            _rev: REV_CURRENT
        });

        expect(result.revisions).to.deep.equal([]);
        expect(result.availableCount).to.equal(0);
    });
});

describe('resolveRevisionPair', () => {
    it('should default to previous and current available revisions', () => {
        const pair = resolveRevisionPair(revsInfo);
        expect(pair.from).to.deep.equal({ rev: REV_PREVIOUS, status: 'available' });
        expect(pair.to).to.deep.equal({ rev: REV_CURRENT, status: 'available' });
        expect(pair.warning).to.equal(COMPACTION_WARNING);
    });

    it('should resolve current and previous aliases', () => {
        const pair = resolveRevisionPair(revsInfo, 'previous', 'current');
        expect(pair.from.rev).to.equal(REV_PREVIOUS);
        expect(pair.to.rev).to.equal(REV_CURRENT);
    });

    it('should resolve explicit revision tokens, skipping compacted history', () => {
        const pair = resolveRevisionPair(revsInfo, REV_OLDER, REV_CURRENT);
        expect(pair.from.rev).to.equal(REV_OLDER);
        expect(pair.to.rev).to.equal(REV_CURRENT);
    });

    it('should throw 400 when no previous available revision exists', () => {
        expect(() => resolveRevisionPair([
            { rev: REV_CURRENT, status: 'available' },
            { rev: REV_MISSING, status: 'missing' }
        ])).to.throw(DocDiffError)
            .that.has.property('status', 400);
        expect(() => resolveRevisionPair([
            { rev: REV_CURRENT, status: 'available' }
        ])).to.throw('No previous available revision');
    });

    it('should throw 400 when from and to resolve to the same revision', () => {
        expect(() => resolveRevisionPair(revsInfo, REV_CURRENT, 'current'))
            .to.throw('from and to revisions must be different')
            .that.has.property('status', 400);
    });

    it('should throw 404 when an explicit revision is unknown', () => {
        expect(() => resolveRevisionPair(revsInfo, '9-ffffffffffffffffffffffffffffffff'))
            .to.throw(DocDiffError)
            .that.has.property('status', 404);
    });

    it('should throw 404 with a compaction message when a revision is missing', () => {
        try {
            resolveRevisionPair(revsInfo, REV_MISSING, REV_CURRENT);
            expect.fail('expected DocDiffError');
        } catch (error) {
            expect(error).to.be.instanceOf(DocDiffError);
            expect(error.status).to.equal(404);
            expect(error.message).to.include('missing');
            expect(error.message).to.include('compaction');
        }
    });

    it('should throw 404 when an explicit revision is deleted', () => {
        try {
            resolveRevisionPair(revsInfo, REV_DELETED, REV_CURRENT);
            expect.fail('expected DocDiffError');
        } catch (error) {
            expect(error).to.be.instanceOf(DocDiffError);
            expect(error.status).to.equal(404);
            expect(error.message).to.include('deleted');
        }
    });
});

describe('diffDocuments', () => {
    it('should ignore _rev differences', () => {
        const changes = diffDocuments(
            { _id: 'doc-1', _rev: REV_PREVIOUS, status: 'Active' },
            { _id: 'doc-1', _rev: REV_CURRENT, status: 'Active' }
        );
        expect(changes).to.deep.equal([]);
    });

    it('should report replaced, added, and removed fields', () => {
        const changes = diffDocuments(
            { _rev: REV_PREVIOUS, status: 'Active', oldField: 'x' },
            { _rev: REV_CURRENT, status: 'Inactive', notes: 'Called family' }
        );

        expect(changes).to.deep.include({
            path: 'status',
            op: 'replace',
            from: 'Active',
            to: 'Inactive'
        });
        expect(changes).to.deep.include({
            path: 'notes',
            op: 'add',
            to: 'Called family'
        });
        expect(changes).to.deep.include({
            path: 'oldField',
            op: 'remove',
            from: 'x'
        });
    });

    it('should recurse into nested objects and index arrays', () => {
        const changes = diffDocuments(
            {
                name: { first: 'John', last: 'Smith' },
                tags: ['a', 'b']
            },
            {
                name: { first: 'Jon', last: 'Smith' },
                tags: ['a', 'c', 'd']
            }
        );

        expect(changes).to.deep.include({
            path: 'name.first',
            op: 'replace',
            from: 'John',
            to: 'Jon'
        });
        expect(changes).to.deep.include({
            path: 'tags[1]',
            op: 'replace',
            from: 'b',
            to: 'c'
        });
        expect(changes).to.deep.include({
            path: 'tags[2]',
            op: 'add',
            to: 'd'
        });
    });

    it('should report removed trailing array items', () => {
        const changes = diffDocuments(
            { tags: ['a', 'b'] },
            { tags: ['a'] }
        );

        expect(changes).to.deep.equal([
            { path: 'tags[1]', op: 'remove', from: 'b' }
        ]);
    });
});

describe('buildDiffResponse', () => {
    it('should combine revision metadata, changes, and raw documents', () => {
        const fromDoc = { _id: 'veteran-123', _rev: REV_PREVIOUS, status: 'Active' };
        const toDoc = { _id: 'veteran-123', _rev: REV_CURRENT, status: 'Inactive' };
        const pair = {
            from: { rev: REV_PREVIOUS, status: 'available' },
            to: { rev: REV_CURRENT, status: 'available' },
            warning: COMPACTION_WARNING
        };

        const result = buildDiffResponse('veteran-123', pair, fromDoc, toDoc);

        expect(result.id).to.equal('veteran-123');
        expect(result.from).to.deep.equal(pair.from);
        expect(result.to).to.deep.equal(pair.to);
        expect(result.fromDoc).to.deep.equal(fromDoc);
        expect(result.toDoc).to.deep.equal(toDoc);
        expect(result.warning).to.equal(COMPACTION_WARNING);
        expect(result.changes).to.deep.equal([
            { path: 'status', op: 'replace', from: 'Active', to: 'Inactive' }
        ]);
    });

    it('should omit warning when history was not compacted', () => {
        const pair = {
            from: { rev: REV_PREVIOUS, status: 'available' },
            to: { rev: REV_CURRENT, status: 'available' }
        };
        const result = buildDiffResponse('doc-1', pair, { ok: true }, { ok: true });
        expect(result).to.not.have.property('warning');
    });
});
