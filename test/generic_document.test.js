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
    buildLogisticsDocument,
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

describe('buildLogisticsDocument', () => {
    const user = { firstName: 'Admin', lastName: 'User' };
    const flightBody = {
        _id: 'flight-2026-spring',
        _rev: '1-client',
        _deleted: true,
        type: 'Flight',
        name: 'Spring 2026',
        flight_date: '2026-04-15',
        capacity: 100,
        completed: true,
        metadata: {
            created_at: '1999-01-01T00:00:00Z',
            created_by: 'Attacker',
            updated_at: '1999-01-01T00:00:00Z',
            updated_by: 'Attacker'
        },
        views: { all: {} },
        validate_doc_update: 'function () {}'
    };

    it('validates a new flight, ignores client audit fields, and leaves the revision unset', () => {
        const doc = buildLogisticsDocument(flightBody, { user });

        expect(doc._rev).to.equal(undefined);
        expect(doc._deleted).to.equal(undefined);
        expect(doc.views).to.equal(undefined);
        expect(doc.completed).to.equal(false);
        expect(doc.metadata.created_by).to.equal('Admin User');
        expect(doc.metadata.updated_by).to.equal('Admin User');
        expect(doc.name).to.equal('Spring 2026');
    });

    it('rejects a flight that fails model validation before a write', () => {
        expect(() => buildLogisticsDocument({
            ...flightBody,
            name: ''
        }, { user })).to.throw(/Validation failed/);
    });

    it('preserves stored creation metadata and history, and records the updating user', () => {
        const historyEntry = {
            id: '2020-01-01T00:00:00Z',
            change: 'original assignment'
        };
        const doc = buildLogisticsDocument({
            _id: 'veteran-1',
            type: 'Veteran',
            name: { first: 'John', last: 'Smith' },
            address: {
                street: '123 Main St',
                city: 'Springfield',
                state: 'IL',
                zip: '62701',
                county: 'Sangamon',
                phone_day: '217-555-1234'
            },
            metadata: { created_by: 'Attacker', created_at: '1999-01-01T00:00:00Z' },
            flight: { history: [] }
        }, {
            urlId: 'veteran-1',
            user,
            currentDoc: {
                _id: 'veteran-1',
                _rev: '4-stored',
                type: 'Veteran',
                name: { first: 'John', last: 'Smith' },
                address: {
                    street: '123 Main St',
                    city: 'Springfield',
                    state: 'IL',
                    zip: '62701',
                    county: 'Sangamon',
                    phone_day: '217-555-1234'
                },
                metadata: {
                    created_at: '2020-01-01T00:00:00Z',
                    created_by: 'Original Author'
                },
                flight: { history: [historyEntry] }
            }
        });

        expect(doc._rev).to.equal('4-stored');
        expect(doc.metadata.created_by).to.equal('Original Author');
        expect(doc.metadata.created_at).to.equal('2020-01-01T00:00:00Z');
        expect(doc.metadata.updated_by).to.equal('Admin User');
        expect(doc.flight.history[0]).to.deep.equal(historyEntry);
    });
});
