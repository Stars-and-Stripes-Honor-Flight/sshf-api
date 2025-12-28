import { expect } from 'chai';
import sinon from 'sinon';
import { getFlightAssignments, addVeteransToFlight } from '../routes/flight-assignments.js';

describe('Flight Assignments Route Handlers', () => {
    let req, res;

    beforeEach(() => {
        req = {
            params: { id: 'flight-123' },
            body: { veteranCount: 5 },
            user: { firstName: 'Admin', lastName: 'User' },
            dbCookie: 'auth-cookie'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getFlightAssignments', () => {
        const mockFlightDoc = {
            _id: 'flight-123',
            _rev: '1-abc',
            type: 'Flight',
            name: 'SSHF-Nov2024',
            capacity: 100,
            flight_date: '2024-11-05'
        };

        it('should return flight assignment data with pairs', async () => {
            // Mock flight document fetch
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Mock flight_assignment view
            const mockViewResult = {
                rows: [
                    { 
                        value: { 
                            pair: 'pair-1', 
                            type: 'Veteran', 
                            id: 'vet-1', 
                            name_first: 'John',
                            name_last: 'Doe',
                            group: '',
                            appdate: '2024-01-15',
                            nofly: false,
                            confirmed: '2024-02-01',
                            paired_with: 'guard-1'
                        } 
                    },
                    { 
                        value: { 
                            pair: 'pair-1', 
                            type: 'Guardian', 
                            id: 'guard-1',
                            name_first: 'Jane',
                            name_last: 'Smith',
                            nofly: false,
                            confirmed: ''
                        } 
                    }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightAssignments(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.flight.name).to.equal('SSHF-Nov2024');
            expect(response.flight.capacity).to.equal(100);
            expect(response.pairs.length).to.equal(1);
            expect(response.pairs[0].people.length).to.equal(2);
            expect(response.counts.veterans).to.equal(1);
            expect(response.counts.guardians).to.equal(1);
            expect(response.counts.remaining).to.equal(98);
        });

        it('should return empty pairs for flight with no assignments', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ rows: [] })
            });

            await getFlightAssignments(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.pairs.length).to.equal(0);
            expect(response.counts.veterans).to.equal(0);
            expect(response.counts.guardians).to.equal(0);
            expect(response.counts.remaining).to.equal(100);
        });

        it('should return 404 when flight not found', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Flight not found');
        });

        it('should return 400 when document is not a flight', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Veteran' })
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a flight record');
        });

        it('should return 500 when flight fetch fails', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database error');
        });

        it('should return 500 when flight fetch fails without reason', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get flight');
        });

        it('should return 500 when view fetch fails', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'View error' })
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('View error');
        });

        it('should return 500 when view fetch fails without reason', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({})
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to retrieve flight assignments');
        });

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await getFlightAssignments(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should exclude nofly people from counts', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { value: { pair: 'p1', type: 'Veteran', id: 'v1', nofly: true } },
                    { value: { pair: 'p2', type: 'Veteran', id: 'v2', nofly: false } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightAssignments(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.counts.veterans).to.equal(1); // Only v2 counted
            expect(response.counts.remaining).to.equal(99);
        });
    });

    describe('addVeteransToFlight', () => {
        const mockFlightDoc = {
            _id: 'flight-123',
            _rev: '1-abc',
            type: 'Flight',
            name: 'SSHF-Nov2024',
            capacity: 100,
            flight_date: '2024-11-05'
        };

        it('should add veterans to flight successfully', async () => {
            // Mock flight document fetch
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Mock waitlist view
            const mockWaitlistResult = {
                rows: [{
                    id: 'vet-1',
                    value: '',
                    doc: {
                        _id: 'vet-1',
                        _rev: '1-xyz',
                        type: 'Veteran',
                        flight: { id: 'None', history: [] },
                        guardian: { id: '' },
                        metadata: {}
                    }
                }]
            };

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => mockWaitlistResult
            });

            // Mock veteran save
            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({ ok: true, id: 'vet-1', rev: '2-abc' })
            });

            await addVeteransToFlight(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1);
            expect(response.errors.length).to.equal(0);
        });

        it('should add veterans with paired guardians', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Veteran with guardian
            const mockWaitlistResult = {
                rows: [{
                    id: 'vet-1',
                    value: '',
                    doc: {
                        _id: 'vet-1',
                        _rev: '1-xyz',
                        type: 'Veteran',
                        flight: { id: 'None', history: [] },
                        guardian: { id: 'guard-1'.padEnd(32, '0') }, // 32 char ID
                        metadata: {}
                    }
                }]
            };

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => mockWaitlistResult
            });

            // Save veteran
            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({ ok: true, id: 'vet-1', rev: '2-abc' })
            });

            // Get guardian
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({
                    _id: 'guard-1'.padEnd(32, '0'),
                    _rev: '1-grd',
                    type: 'Guardian',
                    flight: { id: 'None', history: [] },
                    metadata: {}
                })
            });

            // Save guardian
            global.fetch.onCall(4).resolves({
                ok: true,
                json: async () => ({ ok: true, rev: '2-grd' })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1);
            expect(response.added.guardians).to.equal(1);
        });

        it('should not add guardian if already on the same flight', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockWaitlistResult = {
                rows: [{
                    id: 'vet-1',
                    value: '',
                    doc: {
                        _id: 'vet-1',
                        _rev: '1-xyz',
                        flight: { id: 'None', history: [] },
                        guardian: { id: 'guard-1'.padEnd(32, '0') },
                        metadata: {}
                    }
                }]
            };

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => mockWaitlistResult
            });

            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({ ok: true })
            });

            // Guardian already on this flight
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({
                    _id: 'guard-1'.padEnd(32, '0'),
                    flight: { id: 'SSHF-Nov2024' } // Same flight
                })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.guardians).to.equal(0); // Not incremented
        });

        it('should handle veteran groups', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // First veteran has a group
            const mockWaitlistResult = {
                rows: [{
                    id: 'vet-1',
                    value: 'GroupA',
                    doc: {
                        _id: 'vet-1',
                        _rev: '1-xyz',
                        flight: { id: 'None', group: 'GroupA', history: [] },
                        guardian: { id: '' },
                        metadata: {}
                    }
                }]
            };

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => mockWaitlistResult
            });

            // Group view returns another member
            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        key: 'GroupA',
                        id: 'vet-2',
                        doc: {
                            _id: 'vet-2',
                            _rev: '1-abc',
                            flight: { id: 'None', group: 'GroupA', history: [] },
                            guardian: { id: '' },
                            metadata: {}
                        }
                    }]
                })
            });

            // Save first veteran
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({ ok: true })
            });

            // Save group member
            global.fetch.onCall(4).resolves({
                ok: true,
                json: async () => ({ ok: true })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(2);
        });

        it('should not add group member already on a flight', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockWaitlistResult = {
                rows: [{
                    id: 'vet-1',
                    value: 'GroupA',
                    doc: {
                        _id: 'vet-1',
                        flight: { id: 'None', history: [] },
                        guardian: { id: '' },
                        metadata: {}
                    }
                }]
            };

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => mockWaitlistResult
            });

            // Group member already on a flight
            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        key: 'GroupA',
                        id: 'vet-2',
                        doc: {
                            _id: 'vet-2',
                            flight: { id: 'OtherFlight' } // Already assigned
                        }
                    }]
                })
            });

            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({ ok: true })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1); // Only first vet
        });

        it('should not duplicate group members already in selection', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Both vets from same group in initial waitlist
            const mockWaitlistResult = {
                rows: [
                    { id: 'vet-1', value: 'GroupA', doc: { _id: 'vet-1', flight: { id: 'None', history: [] }, guardian: { id: '' }, metadata: {} } },
                    { id: 'vet-2', value: 'GroupA', doc: { _id: 'vet-2', flight: { id: 'None', history: [] }, guardian: { id: '' }, metadata: {} } }
                ]
            };

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => mockWaitlistResult
            });

            // Group view also returns them
            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({
                    rows: [
                        { key: 'GroupA', id: 'vet-1', doc: { _id: 'vet-1', flight: { id: 'None' } } },
                        { key: 'GroupA', id: 'vet-2', doc: { _id: 'vet-2', flight: { id: 'None' } } }
                    ]
                })
            });

            global.fetch.onCall(3).resolves({ ok: true, json: async () => ({ ok: true }) });
            global.fetch.onCall(4).resolves({ ok: true, json: async () => ({ ok: true }) });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(2); // Each counted once
        });

        it('should return 400 for invalid veteranCount (too low)', async () => {
            req.body.veteranCount = 0;

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('veteranCount must be between 1 and 100');
        });

        it('should return 400 for invalid veteranCount (too high)', async () => {
            req.body.veteranCount = 101;

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 400 for missing veteranCount', async () => {
            req.body = {};

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 404 when flight not found', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should return 400 when document is not a flight', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Veteran' })
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 500 when flight fetch fails', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should return 500 when flight fetch fails without reason', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get flight');
        });

        it('should return 500 when waitlist fetch fails', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: false,
                json: async () => ({ reason: 'Waitlist error' })
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should return 500 when waitlist fetch fails without reason', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: false,
                json: async () => ({})
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to retrieve waitlist');
        });

        it('should handle veteran save failure', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: '' },
                            metadata: {}
                        }
                    }]
                })
            });

            global.fetch.onCall(2).resolves({
                ok: false,
                json: async () => ({ reason: 'Conflict' })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(0);
            expect(response.errors.length).to.equal(1);
            expect(response.errors[0]).to.include('Failed to save veteran');
        });

        it('should handle veteran save failure without reason', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: { _id: 'vet-1', flight: { id: 'None', history: [] }, guardian: { id: '' }, metadata: {} }
                    }]
                })
            });

            global.fetch.onCall(2).resolves({
                ok: false,
                json: async () => ({})
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.errors[0]).to.include('Unknown error');
        });

        it('should handle guardian save failure', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: 'guard-1'.padEnd(32, '0') },
                            metadata: {}
                        }
                    }]
                })
            });

            // Veteran save succeeds
            global.fetch.onCall(2).resolves({
                ok: true,
                json: async () => ({ ok: true })
            });

            // Guardian fetch succeeds
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({
                    _id: 'guard-1'.padEnd(32, '0'),
                    flight: { id: 'None', history: [] },
                    metadata: {}
                })
            });

            // Guardian save fails
            global.fetch.onCall(4).resolves({
                ok: false,
                json: async () => ({ reason: 'Guardian conflict' })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1);
            expect(response.added.guardians).to.equal(0);
            expect(response.errors.length).to.equal(1);
            expect(response.errors[0]).to.include('Failed to save guardian');
        });

        it('should handle guardian save failure without reason', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: 'guard-1'.padEnd(32, '0') },
                            metadata: {}
                        }
                    }]
                })
            });

            global.fetch.onCall(2).resolves({ ok: true, json: async () => ({ ok: true }) });
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({ _id: 'guard-1'.padEnd(32, '0'), flight: { id: 'None', history: [] }, metadata: {} })
            });
            global.fetch.onCall(4).resolves({
                ok: false,
                json: async () => ({})
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.errors[0]).to.include('Unknown error');
        });

        it('should handle guardian fetch error', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: 'guard-1'.padEnd(32, '0') },
                            metadata: {}
                        }
                    }]
                })
            });

            global.fetch.onCall(2).resolves({ ok: true, json: async () => ({ ok: true }) });
            
            // Guardian fetch throws error
            global.fetch.onCall(3).rejects(new Error('Network error'));

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1);
            expect(response.errors[0]).to.include('Error processing guardian');
        });

        it('should skip row without doc', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [
                        { id: 'vet-1', value: '', doc: null },
                        { id: 'vet-2', value: '', doc: { _id: 'vet-2', flight: { id: 'None', history: [] }, guardian: { id: '' }, metadata: {} } }
                    ]
                })
            });

            global.fetch.onCall(2).resolves({ ok: true, json: async () => ({ ok: true }) });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1); // Only vet-2
        });

        it('should handle veteran processing exception', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: null, // Will cause error when accessing flight.id
                            guardian: { id: '' },
                            metadata: {}
                        }
                    }]
                })
            });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.errors.length).to.equal(1);
            expect(response.errors[0]).to.include('Error processing veteran');
        });

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await addVeteransToFlight(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should skip guardian with short ID', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: 'short-id' }, // Less than 32 chars
                            metadata: {}
                        }
                    }]
                })
            });

            global.fetch.onCall(2).resolves({ ok: true, json: async () => ({ ok: true }) });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1);
            expect(response.added.guardians).to.equal(0); // Guardian not processed
        });

        it('should initialize flight.history if not present', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None' }, // No history array
                            guardian: { id: '' },
                            metadata: {}
                        }
                    }]
                })
            });

            let savedDoc = null;
            global.fetch.onCall(2).callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ ok: true }) };
            });

            await addVeteransToFlight(req, res);

            expect(savedDoc.flight.history).to.be.an('array');
            expect(savedDoc.flight.history.length).to.equal(1);
        });

        it('should handle group view failure gracefully', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: 'GroupA',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: '' },
                            metadata: {}
                        }
                    }]
                })
            });

            // Group view fails
            global.fetch.onCall(2).resolves({
                ok: false,
                json: async () => ({ error: 'view error' })
            });

            // Should still process the veteran from initial waitlist
            global.fetch.onCall(3).resolves({ ok: true, json: async () => ({ ok: true }) });

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(1);
        });

        it('should not add same guardian twice (dedup with processedGuardians)', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const guardianId = 'guard-1'.padEnd(32, '0');
            
            // Two veterans with same guardian
            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [
                        { id: 'vet-1', value: '', doc: { _id: 'vet-1', flight: { id: 'None', history: [] }, guardian: { id: guardianId }, metadata: {} } },
                        { id: 'vet-2', value: '', doc: { _id: 'vet-2', flight: { id: 'None', history: [] }, guardian: { id: guardianId }, metadata: {} } }
                    ]
                })
            });

            // Save vet-1
            global.fetch.onCall(2).resolves({ ok: true, json: async () => ({ ok: true }) });

            // Get guardian (for vet-1)
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({ _id: guardianId, flight: { id: 'None', history: [] }, metadata: {} })
            });

            // Save guardian
            global.fetch.onCall(4).resolves({ ok: true, json: async () => ({ ok: true }) });

            // Save vet-2
            global.fetch.onCall(5).resolves({ ok: true, json: async () => ({ ok: true }) });

            // Guardian should NOT be fetched again for vet-2

            await addVeteransToFlight(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.added.veterans).to.equal(2);
            expect(response.added.guardians).to.equal(1); // Only counted once
        });

        it('should initialize guardian flight.history if not present', async () => {
            global.fetch.onCall(0).resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            global.fetch.onCall(1).resolves({
                ok: true,
                json: async () => ({
                    rows: [{
                        id: 'vet-1',
                        value: '',
                        doc: {
                            _id: 'vet-1',
                            flight: { id: 'None', history: [] },
                            guardian: { id: 'guard-1'.padEnd(32, '0') },
                            metadata: {}
                        }
                    }]
                })
            });

            global.fetch.onCall(2).resolves({ ok: true, json: async () => ({ ok: true }) });

            // Guardian without flight.history
            let savedGuardianDoc = null;
            global.fetch.onCall(3).resolves({
                ok: true,
                json: async () => ({
                    _id: 'guard-1'.padEnd(32, '0'),
                    flight: { id: 'None' }, // No history array
                    metadata: {}
                })
            });

            global.fetch.onCall(4).callsFake(async (url, options) => {
                savedGuardianDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ ok: true }) };
            });

            await addVeteransToFlight(req, res);

            expect(savedGuardianDoc.flight.history).to.be.an('array');
            expect(savedGuardianDoc.flight.history.length).to.equal(1);
            expect(savedGuardianDoc.flight.history[0].change).to.include('changed flight from');
        });
    });
});

