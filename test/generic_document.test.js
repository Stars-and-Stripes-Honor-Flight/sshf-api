import { expect } from 'chai';
import {
    ALLOWED_DOCUMENT_TYPES,
    DESIGN_OR_SYSTEM_ID_ERROR,
    ID_MISMATCH_ERROR,
    MISSING_ID_ERROR,
    STORED_TYPE_NOT_ALLOWED_ERROR,
    TYPE_CHANGE_ERROR,
    TYPE_NOT_ALLOWED_ERROR,
    assertStoredDocumentType,
    prepareGenericDocumentWrite
} from '../models/generic_document.js';

describe('generic document write validation', () => {
    const validBody = {
        _id: 'flight-2026-spring',
        _rev: '1-client',
        _deleted: true,
        type: 'Flight',
        name: 'Spring 2026',
        language: 'javascript',
        views: { all: {} },
        validate_doc_update: 'function () {}',
        filters: {},
        shows: {},
        lists: {},
        updates: {},
        rewrites: [],
        libs: {},
        indexes: {},
        options: { local_seq: true }
    };

    it('limits writes to Flight, Guardian, and Veteran', () => {
        expect(ALLOWED_DOCUMENT_TYPES).to.deep.equal(['Flight', 'Guardian', 'Veteran']);
    });

    it('requires _id', () => {
        expect(() => prepareGenericDocumentWrite({ type: 'Flight', name: 'Spring' }))
            .to.throw(MISSING_ID_ERROR);
    });

    it('rejects a design-document id', () => {
        expect(() => prepareGenericDocumentWrite({ ...validBody, _id: '_design/hf-app-review' }))
            .to.throw(DESIGN_OR_SYSTEM_ID_ERROR);
    });

    it('rejects a local system document id', () => {
        expect(() => prepareGenericDocumentWrite({ ...validBody, _id: '_local/shard' }))
            .to.throw(DESIGN_OR_SYSTEM_ID_ERROR);
    });

    it('rejects an id that is unsafe in a CouchDB URL', () => {
        expect(() => prepareGenericDocumentWrite({ ...validBody, _id: 'foo/bar' }))
            .to.throw('Invalid document id');
    });

    it('rejects a body _id that does not match the URL id', () => {
        expect(() => prepareGenericDocumentWrite(validBody, { urlId: 'other-id' }))
            .to.throw(ID_MISMATCH_ERROR);
    });

    it('rejects a type outside the allowlist', () => {
        expect(() => prepareGenericDocumentWrite({ ...validBody, type: 'Note' }))
            .to.throw(TYPE_NOT_ALLOWED_ERROR);
    });

    it('returns a stored document without client revision, deletion, or design-document fields', () => {
        const doc = prepareGenericDocumentWrite(validBody, { urlId: validBody._id });

        expect(doc).to.deep.equal({
            _id: 'flight-2026-spring',
            type: 'Flight',
            name: 'Spring 2026'
        });
    });

    it('accepts Guardian and Veteran types', () => {
        expect(prepareGenericDocumentWrite({ _id: 'g-1', type: 'Guardian' }).type).to.equal('Guardian');
        expect(prepareGenericDocumentWrite({ _id: 'v-1', type: 'Veteran' }).type).to.equal('Veteran');
    });

    it('rejects a stored document whose type is not allowlisted', () => {
        expect(() => assertStoredDocumentType({ type: 'Note' }, 'Flight'))
            .to.throw(STORED_TYPE_NOT_ALLOWED_ERROR);
    });

    it('rejects a type change on update', () => {
        expect(() => assertStoredDocumentType({ type: 'Flight' }, 'Guardian'))
            .to.throw(TYPE_CHANGE_ERROR);
    });

    it('allows an update when the stored type matches the body type', () => {
        expect(assertStoredDocumentType({ type: 'Veteran' }, 'Veteran')).to.equal(true);
    });
});
