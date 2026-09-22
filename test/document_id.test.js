import { expect } from 'chai';
import {
    INVALID_DOCUMENT_ID_ERROR,
    buildCouchDocumentUrl,
    getEncodedDocumentIdSegment
} from '../utils/document_id.js';

describe('document id validation and encoding', () => {
    describe('getEncodedDocumentIdSegment', () => {
        it('accepts a normal id and returns an encoded segment', () => {
            const result = getEncodedDocumentIdSegment('veteran-123');
            expect(result).to.deep.equal({ encoded: 'veteran-123' });
        });

        it('encodes characters that are not safe in URL path segments', () => {
            const id = 'vet:123@test';
            const result = getEncodedDocumentIdSegment(id);
            expect(result.encoded).to.equal(encodeURIComponent(id));
        });

        it('rejects an empty id', () => {
            expect(getEncodedDocumentIdSegment('')).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
        });

        it('rejects non-string ids', () => {
            expect(getEncodedDocumentIdSegment(undefined)).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
            expect(getEncodedDocumentIdSegment(null)).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
        });

        it('rejects path traversal segments', () => {
            expect(getEncodedDocumentIdSegment('..')).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
            expect(getEncodedDocumentIdSegment('foo..bar')).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
        });

        it('rejects slash and backslash', () => {
            expect(getEncodedDocumentIdSegment('foo/bar')).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
            expect(getEncodedDocumentIdSegment('foo\\bar')).to.deep.equal({ error: INVALID_DOCUMENT_ID_ERROR });
        });

        it('rejects ids that start with underscore', () => {
            expect(getEncodedDocumentIdSegment('_design/views')).to.deep.equal({
                error: INVALID_DOCUMENT_ID_ERROR
            });
        });
    });

    describe('buildCouchDocumentUrl', () => {
        it('builds a URL with an encoded document segment', () => {
            const id = 'vet:123@test';
            const result = buildCouchDocumentUrl('http://db:5984/mydb', id);
            expect(result.url).to.equal(`http://db:5984/mydb/${encodeURIComponent(id)}`);
        });

        it('returns an error without building a URL for invalid ids', () => {
            expect(buildCouchDocumentUrl('http://db:5984/mydb', '..')).to.deep.equal({
                error: INVALID_DOCUMENT_ID_ERROR
            });
        });
    });
});
