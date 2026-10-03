import { expect } from 'chai';
import sinon from 'sinon';
import { Veteran } from '../models/veteran.js';
import { Guardian } from '../models/guardian.js';
import {
    FutureStatusRequest,
    FlightStatusBulkResult,
    applyStatusChange,
    isOnFlight
} from '../models/flight_status_update.js';

const FIXED_NOW = '2026-10-03T15:04:05Z';
const USER = { firstName: 'First', lastName: 'Last' };

function useFixedClock() {
    return sinon.useFakeTimers({
        now: new Date(FIXED_NOW),
        toFake: ['Date']
    });
}

function storedPerson(type, status) {
    const doc = {
        _id: type === 'Veteran' ? 'vet-1' : 'guard-1',
        _rev: '1-abc',
        type,
        name: { first: 'John', last: 'Smith' },
        address: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
            county: 'Sangamon',
            phone_day: '217-555-1234'
        },
        flight: {
            id: 'SSHF-Nov2024',
            status,
            history: [{ id: '2020-01-01T00:00:00Z', change: 'existing flight change' }]
        },
        call: {
            history: [{ id: '2020-01-01T00:00:00Z', change: 'existing call change' }]
        },
        metadata: {
            created_at: '2020-01-01T00:00:00Z',
            created_by: 'Importer',
            updated_at: '2020-06-01T00:00:00Z',
            updated_by: 'Importer'
        }
    };
    if (type === 'Veteran') {
        doc.guardian = {
            history: [{ id: '2020-01-01T00:00:00Z', change: 'paired to: Jane by: Importer' }]
        };
    } else {
        doc.veteran = {
            history: [{ id: '2020-01-01T00:00:00Z', change: 'paired to: John by: Importer' }],
            pairings: [{ id: 'vet-9', name: 'John Smith' }]
        };
    }
    return doc;
}

function manualStatusEdit(doc, toStatus) {
    const Model = doc.type === 'Veteran' ? Veteran : Guardian;
    const current = Model.fromJSON(structuredClone(doc));
    const updated = Model.fromJSON(structuredClone(doc));
    updated.flight.status = toStatus;
    updated.updateHistory(current, USER);
    updated.prepareForSave(USER);
    return updated;
}

describe('Flight status update model', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('FutureStatusRequest', () => {
        it('accepts any Future- status, including unknown and padded values', () => {
            for (const status of ['Future-Spring', 'Future-Fall', 'Future-PostRestriction', 'Future-Winter']) {
                expect(new FutureStatusRequest({ status }).status).to.equal(status);
            }
            expect(new FutureStatusRequest({ status: ' Future-Spring ' }).status).to.equal('Future-Spring');
        });

        it('rejects a missing value, a non-string, an empty prefix, and other statuses', () => {
            const rejected = [
                undefined,
                null,
                [],
                {},
                { status: undefined },
                { status: null },
                { status: 1 },
                { status: '' },
                { status: '   ' },
                { status: 'Future-' },
                { status: ' Future- ' },
                { status: 'future-spring' },
                { status: 'Active' },
                { status: 'Flown' }
            ];
            for (const body of rejected) {
                expect(() => new FutureStatusRequest(body), JSON.stringify(body)).to.throw(
                    'status must begin with "Future-"'
                );
            }
        });
    });

    describe('applyStatusChange', () => {
        const cases = [
            { type: 'Veteran', from: 'Active', to: 'Flown' },
            { type: 'Guardian', from: 'Active', to: 'Flown' },
            { type: 'Veteran', from: 'Future-Spring', to: 'Active' },
            { type: 'Guardian', from: 'Future-Spring', to: 'Active' }
        ];

        for (const { type, from, to } of cases) {
            it(`matches a single-person ${type} edit from ${from} to ${to}`, () => {
                const clock = useFixedClock();
                try {
                    const stored = storedPerson(type, from);
                    const manual = manualStatusEdit(stored, to);
                    const saved = structuredClone(stored);
                    applyStatusChange(saved, to, USER);

                    expect(saved.flight.history).to.deep.equal(manual.flight.history);
                    expect(saved.metadata).to.deep.equal(manual.metadata);
                    expect(saved.flight.history).to.have.length(2);
                    expect(saved.flight.history[1]).to.deep.equal({
                        id: FIXED_NOW,
                        change: `changed status from: ${from} to: ${to} by: First Last`
                    });
                    expect(saved.call.history).to.deep.equal(stored.call.history);
                    if (type === 'Veteran') {
                        expect(saved.guardian.history).to.deep.equal(stored.guardian.history);
                    } else {
                        expect(saved.veteran.history).to.deep.equal(stored.veteran.history);
                        expect(saved.veteran.pairings).to.deep.equal(stored.veteran.pairings);
                    }
                    expect(saved.metadata.updated_at).to.equal(FIXED_NOW);
                    expect(saved.metadata.updated_by).to.equal('First Last');
                    expect(saved.metadata.created_at).to.equal('2020-01-01T00:00:00Z');
                    expect(saved.metadata.created_by).to.equal('Importer');
                } finally {
                    clock.restore();
                }
            });
        }

        it('keeps unknown legacy fields and does not trim other strings', () => {
            const clock = useFixedClock();
            try {
                const doc = storedPerson('Veteran', 'Active');
                doc.legacyNote = '  keep spaces  ';
                doc.name.first = '  John  ';
                doc.custom = { flag: true };
                doc.flight.history[0].change = '  existing  ';
                doc.metadata.extra = 'keep-me';
                const callHistory = doc.call.history;
                const pairingHistory = doc.guardian.history;

                applyStatusChange(doc, 'Flown', USER);

                expect(doc.legacyNote).to.equal('  keep spaces  ');
                expect(doc.name.first).to.equal('  John  ');
                expect(doc.custom).to.deep.equal({ flag: true });
                expect(doc.flight.history[0].change).to.equal('  existing  ');
                expect(doc.flight.status).to.equal('Flown');
                expect(doc.metadata.extra).to.equal('keep-me');
                expect(doc.call.history).to.equal(callHistory);
                expect(doc.guardian.history).to.equal(pairingHistory);
            } finally {
                clock.restore();
            }
        });

        it('fills empty created metadata and missing metadata the way prepareForSave does', () => {
            const clock = useFixedClock();
            try {
                const emptyCreated = storedPerson('Guardian', 'Active');
                emptyCreated.metadata = {
                    created_at: '',
                    created_by: '',
                    updated_at: '',
                    updated_by: ''
                };
                applyStatusChange(emptyCreated, 'Flown', USER);
                expect(emptyCreated.metadata.created_at).to.equal(FIXED_NOW);
                expect(emptyCreated.metadata.created_by).to.equal('First Last');
                expect(emptyCreated.metadata.updated_at).to.equal(FIXED_NOW);
                expect(emptyCreated.metadata.updated_by).to.equal('First Last');

                const missing = storedPerson('Veteran', 'Future-Spring');
                delete missing.metadata;
                applyStatusChange(missing, 'Active', USER);
                expect(missing.metadata.created_at).to.equal(FIXED_NOW);
                expect(missing.metadata.created_by).to.equal('First Last');
                expect(missing.metadata.updated_at).to.equal(FIXED_NOW);
                expect(missing.metadata.updated_by).to.equal('First Last');
            } finally {
                clock.restore();
            }
        });
    });

    describe('isOnFlight', () => {
        it('is true only when flight.id is a non-empty string other than None', () => {
            expect(isOnFlight({ flight: { id: 'SSHF-Nov2024' } })).to.equal(true);
            expect(isOnFlight({ flight: { id: 'None' } })).to.equal(false);
            expect(isOnFlight({ flight: { id: '' } })).to.equal(false);
            expect(isOnFlight({ flight: {} })).to.equal(false);
            expect(isOnFlight({})).to.equal(false);
            expect(isOnFlight({ flight: { id: 12 } })).to.equal(false);
        });
    });

    describe('FlightStatusBulkResult', () => {
        it('keeps matched = changed + skipped + failed and returns 200 or 207', () => {
            const completion = new FlightStatusBulkResult({
                fromStatus: 'Active',
                toStatus: 'Flown',
                flight: { id: 'flight-1', name: 'SSHF-Nov2024', completed: true }
            });
            expect(() => completion.setCounts({ matched: 3, changed: 3, skipped: 1, failed: 0 })).to.throw(/matched/);
            completion.setCounts({ matched: 4, changed: 2, skipped: 1, failed: 1 });
            expect(completion.counts.matched).to.equal(
                completion.counts.changed + completion.counts.skipped + completion.counts.failed
            );
            expect(completion.statusCode()).to.equal(200);

            completion.addFailure({
                id: 'vet-1',
                type: 'veteran',
                status: 409,
                error: 'Document update conflict.'
            });
            expect(completion.statusCode()).to.equal(207);

            const flightOnly = new FlightStatusBulkResult({
                fromStatus: 'Active',
                toStatus: 'Flown',
                flight: { id: 'flight-1', name: 'SSHF-Nov2024', completed: false }
            });
            flightOnly.setCounts({ matched: 2, changed: 2, skipped: 0, failed: 0 });
            flightOnly.addFailure({
                id: 'flight-1',
                type: 'flight',
                status: 500,
                error: 'Bulk save failed.'
            });
            expect(flightOnly.statusCode()).to.equal(207);
            expect(flightOnly.counts.failed).to.equal(0);

            const activation = new FlightStatusBulkResult({
                fromStatus: 'Future-Spring',
                toStatus: 'Active',
                assignedToFlight: ['person-on-flight']
            });
            activation.setCounts({ matched: 1, changed: 1, skipped: 0, failed: 0 });
            expect(activation.statusCode()).to.equal(200);
        });

        it('matches the schema shape, with assignedToFlight only for future-status activation', () => {
            const completion = new FlightStatusBulkResult({
                fromStatus: 'Active',
                toStatus: 'Flown',
                flight: { id: 'flight-1', name: 'SSHF-Nov2024', completed: true }
            });
            completion.setCounts({ matched: 1, changed: 1, skipped: 0, failed: 0 });
            const completionJson = completion.toJSON();
            expect(completionJson).to.deep.equal({
                fromStatus: 'Active',
                toStatus: 'Flown',
                flight: { id: 'flight-1', name: 'SSHF-Nov2024', completed: true },
                counts: { matched: 1, changed: 1, skipped: 0, failed: 0 },
                failed: []
            });
            expect(completionJson).to.not.have.property('assignedToFlight');

            const activation = new FlightStatusBulkResult({
                fromStatus: 'Future-Spring',
                toStatus: 'Active',
                assignedToFlight: []
            });
            activation.setCounts({ matched: 0, changed: 0, skipped: 0, failed: 0 });
            activation.addFailure({
                id: 'guard-1',
                type: 'guardian',
                status: 403,
                error: 'Document update rejected.'
            });
            const activationJson = activation.toJSON();
            expect(activationJson).to.not.have.property('flight');
            expect(activationJson.assignedToFlight).to.deep.equal([]);
            expect(activationJson.failed[0]).to.include.keys('id', 'type', 'status', 'error');
            expect(activationJson.counts.matched).to.equal(
                activationJson.counts.changed + activationJson.counts.skipped + activationJson.counts.failed
            );
        });
    });
});
