import { expect } from 'chai';
import {
    editVetNote,
    changeSeat,
    changeBus,
    changeCaller,
    pairGuardian,
    unpairGuardian,
    assignToFlight,
    newFlightDoc
} from '../scripts/parity/legacy-ops.mjs';

const ctx = { userName: 'harness-user', timestamp: '2026-08-22T18:00:00Z' };

describe('parity legacy Evently mutations', () => {
    it('edits status_note without a history entry', () => {
        const doc = {
            _id: 'v1',
            type: 'Veteran',
            flight: { status_note: 'old', history: [] },
            metadata: {}
        };
        const next = editVetNote(doc, 'new "note"', ctx);
        expect(next.flight.status_note).to.equal("new 'note'");
        expect(next.flight.history).to.deep.equal([]);
        expect(next.metadata.updated_by).to.equal('harness-user');
        expect(doc.flight.status_note).to.equal('old');
    });

    it('records Evently seat and bus history strings', () => {
        const doc = {
            type: 'Veteran',
            flight: { seat: '1A', bus: 'Alpha1', history: [] },
            metadata: {}
        };
        const seated = changeSeat(doc, '2B', ctx);
        expect(seated.flight.seat).to.equal('2B');
        expect(seated.flight.history[0].change).to.equal(
            'changed seat from: 1A to: 2B by: harness-user'
        );
        const bused = changeBus(doc, 'Bravo3', ctx);
        expect(bused.flight.history[0].change).to.equal(
            'changed bus from: Alpha1 to: Bravo3 by: harness-user'
        );
    });

    it('records assigned caller history on the person being edited', () => {
        const doc = {
            type: 'Veteran',
            call: { assigned_to: '', history: [] },
            metadata: {}
        };
        const next = changeCaller(doc, 'Jane Doe', ctx);
        expect(next.call.assigned_to).to.equal('Jane Doe');
        expect(next.call.history[0].change).to.equal(
            'changed assigned caller from:  to: Jane Doe by: harness-user'
        );
    });

    it('pairs and unpairs guardian-owned denormalized fields', () => {
        const veteran = {
            _id: 'vet1',
            type: 'Veteran',
            name: { first: 'Ted', last: 'Atkinson' },
            guardian: { id: '', name: '', history: [] },
            metadata: {}
        };
        const guardian = {
            _id: 'grd1',
            type: 'Guardian',
            name: { first: 'Carl', last: 'Carstens' },
            veteran: { pairings: [], history: [] },
            metadata: {}
        };
        const paired = pairGuardian({ veteran, guardian }, ctx);
        expect(paired.veteran.guardian.id).to.equal('grd1');
        expect(paired.veteran.guardian.name).to.equal('Carl Carstens');
        expect(paired.veteran.guardian.history[0].change).to.equal(
            'paired to: Carl Carstens by: harness-user'
        );
        expect(paired.guardian.veteran.pairings).to.deep.equal([
            { id: 'vet1', name: 'Ted Atkinson' }
        ]);
        expect(paired.guardian.veteran.history[0].change).to.equal(
            'paired to: Ted Atkinson by: harness-user'
        );

        const unpaired = unpairGuardian(paired, ctx);
        expect(unpaired.veteran.guardian.id).to.equal('');
        expect(unpaired.guardian.veteran.pairings).to.deep.equal([]);
        expect(unpaired.veteran.guardian.history.at(-1).change).to.equal(
            'unpaired from: Carl Carstens by: harness-user'
        );
    });

    it('assigns a person to a flight by name string', () => {
        const doc = {
            type: 'Veteran',
            flight: { id: 'None', history: [] },
            metadata: {}
        };
        const next = assignToFlight(doc, 'SSHF-Parity01', ctx);
        expect(next.flight.id).to.equal('SSHF-Parity01');
        expect(next.flight.history[0].change).to.equal(
            'changed flight from: None to: SSHF-Parity01 by: harness-user'
        );
    });

    it('builds a Flight document with a caller-supplied id', () => {
        const flight = newFlightDoc({
            _id: 'flight-parity-1',
            name: 'SSHF-Parity01',
            flight_date: '2026-11-01',
            capacity: 10,
            ...ctx
        });
        expect(flight.type).to.equal('Flight');
        expect(flight._id).to.equal('flight-parity-1');
        expect(flight.name).to.equal('SSHF-Parity01');
        expect(flight.metadata.created_by).to.equal('harness-user');
    });
});
