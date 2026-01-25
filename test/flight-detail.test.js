import { expect } from 'chai';
import sinon from 'sinon';
import { getFlightDetail } from '../routes/flight-detail.js';

describe('Flight Detail Route Handlers', () => {
    let req, res;

    beforeEach(() => {
        req = {
            params: { id: 'flight-123' },
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

    describe('getFlightDetail', () => {
        const mockFlightDoc = {
            _id: 'flight-123',
            _rev: '1-abc',
            type: 'Flight',
            name: 'SSHF-Nov2024',
            capacity: 100,
            flight_date: '2024-11-05'
        };

        it('should return flight detail data with pairs and stats', async () => {
            // Mock flight document fetch
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Mock flight_pairings view
            const mockViewResult = {
                rows: [
                    { 
                        key: ['SSHF-Nov2024', 'vet-1', 0],
                        value: { 
                            type: 'Veteran', 
                            id: 'vet-1', 
                            name_first: 'John',
                            name_last: 'Doe',
                            city: 'Chicago, IL',
                            bus: 'Alpha1',
                            seat: '14A',
                            shirt: 'XL',
                            nofly: '',
                            confirmed: '',
                            med_limits: '[3/3]',
                            group: '',
                            pairing: 'guard-1'
                        } 
                    },
                    { 
                        key: ['SSHF-Nov2024', 'vet-1', 1],
                        value: { 
                            type: 'Guardian', 
                            id: 'guard-1',
                            name_first: 'Jane',
                            name_last: 'Smith',
                            city: 'Milwaukee, WI',
                            bus: 'Alpha1',
                            seat: '14B',
                            shirt: 'L',
                            nofly: '',
                            confirmed: '',
                            med_exprnc: 'EMT',
                            training: 'Main [A]',
                            training_complete: true,
                            pairing: 'vet-1'
                        } 
                    }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.flight.name).to.equal('SSHF-Nov2024');
            expect(response.flight.capacity).to.equal(100);
            expect(response.pairs.length).to.equal(1);
            expect(response.pairs[0].pairId).to.equal('guard-1');  // Guardian ID as pairId
            expect(response.pairs[0].people.length).to.equal(2);
            expect(response.pairs[0].busMismatch).to.equal(false);
            expect(response.pairs[0].missingPairedPerson).to.equal(false);
            expect(response.stats.buses.Alpha1).to.equal(2);
            expect(response.stats.tours.Alpha).to.equal(2);
            expect(response.stats.flight.Alpha).to.equal(2);
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

            await getFlightDetail(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.pairs.length).to.equal(0);
            expect(response.stats.tours.Alpha).to.equal(0);
            expect(response.stats.tours.Bravo).to.equal(0);
        });

        it('should calculate stats correctly for multiple buses', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', nofly: '' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Alpha3', nofly: '' } },
                    { key: ['SSHF-Nov2024', 'v3', 0], value: { type: 'Veteran', id: 'v3', bus: 'Bravo2', nofly: '' } },
                    { key: ['SSHF-Nov2024', 'v4', 0], value: { type: 'Veteran', id: 'v4', bus: 'Bravo2', nofly: '' } },
                    { key: ['SSHF-Nov2024', 'v5', 0], value: { type: 'Veteran', id: 'v5', bus: 'None', nofly: '' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.stats.buses.Alpha1).to.equal(1);
            expect(response.stats.buses.Alpha3).to.equal(1);
            expect(response.stats.buses.Bravo2).to.equal(2);
            expect(response.stats.buses.None).to.equal(1);
            expect(response.stats.tours.Alpha).to.equal(2);
            expect(response.stats.tours.Bravo).to.equal(2);
            expect(response.stats.tours.None).to.equal(1);
        });

        it('should exclude nofly from flight counts but include in tour counts', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', nofly: '' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Alpha1', nofly: 'nofly' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.stats.buses.Alpha1).to.equal(2);
            expect(response.stats.tours.Alpha).to.equal(2);
            expect(response.stats.flight.Alpha).to.equal(1); // Only v1 counted
        });

        it('should detect bus mismatch in pair', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Bravo2', pairing: 'v1' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].busMismatch).to.equal(true);
        });

        it('should detect missing paired person - veteran missing guardian', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Veteran has pairing to g1, but g1 is not in the results
            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g-missing' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].pairId).to.equal('v1');  // Unpaired veteran uses own ID
            expect(response.pairs[0].missingPairedPerson).to.equal(true);
        });

        it('should detect missing paired person - guardian missing veteran', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Guardian has pairing to v1, but v1 is not in the results
            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'g1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v-missing' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].pairId).to.equal('g1');  // Guardian ID as pairId
            expect(response.pairs[0].missingPairedPerson).to.equal(true);
        });

        it('should not flag missingPairedPerson when paired person is present', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].pairId).to.equal('g1');  // Guardian ID as pairId
            expect(response.pairs[0].missingPairedPerson).to.equal(false);
        });

        it('should group multiple veterans with same guardian', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            // Guardian g1 is paired with v1 and v2 - view returns g1 twice with different pairing values
            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } },
                    { key: ['SSHF-Nov2024', 'v2', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v2' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs.length).to.equal(1);  // One group for guardian g1
            expect(response.pairs[0].pairId).to.equal('g1');  // Guardian ID as pairId
            expect(response.pairs[0].people.length).to.equal(3);  // 2 veterans + 1 guardian (deduplicated)
            
            // Count people by type
            const veteranCount = response.pairs[0].people.filter(p => p.type === 'Veteran').length;
            const guardianCount = response.pairs[0].people.filter(p => p.type === 'Guardian').length;
            expect(veteranCount).to.equal(2);
            expect(guardianCount).to.equal(1);
        });

        it('should not include pairing property in response', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].people[0]).to.not.have.property('pairing');
        });

        it('should return 404 when flight not found', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await getFlightDetail(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Flight not found');
        });

        it('should return 400 when document is not a flight', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Veteran' })
            });

            await getFlightDetail(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a flight record');
        });

        it('should return 500 when flight fetch fails', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await getFlightDetail(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database error');
        });

        it('should return 500 when flight fetch fails without reason', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await getFlightDetail(req, res);

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

            await getFlightDetail(req, res);

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

            await getFlightDetail(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to retrieve flight detail');
        });

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await getFlightDetail(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should include veteran-specific fields in response', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { 
                        key: ['SSHF-Nov2024', 'v1', 0], 
                        value: { 
                            type: 'Veteran', 
                            id: 'v1', 
                            name_first: 'John',
                            name_last: 'Doe',
                            bus: 'Alpha1',
                            seat: '14A',
                            med_limits: '[3/3] wheelchair',
                            group: '583-2'
                        } 
                    }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            const veteran = response.pairs[0].people[0];
            expect(veteran.med_limits).to.equal('[3/3] wheelchair');
            expect(veteran.group).to.equal('583-2');
        });

        it('should include guardian-specific fields in response', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { 
                        key: ['SSHF-Nov2024', 'g1', 1], 
                        value: { 
                            type: 'Guardian', 
                            id: 'g1', 
                            name_first: 'Jane',
                            name_last: 'Smith',
                            bus: 'Bravo2',
                            seat: '7B',
                            med_exprnc: 'Retired Paramedic',
                            training: 'Previous [A]',
                            training_complete: true
                        } 
                    }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            const guardian = response.pairs[0].people[0];
            expect(guardian.med_exprnc).to.equal('Retired Paramedic');
            expect(guardian.training).to.equal('Previous [A]');
            expect(guardian.training_complete).to.equal(true);
        });

        it('should normalize invalid bus values to None', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'InvalidBus' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: '' } },
                    { key: ['SSHF-Nov2024', 'v3', 0], value: { type: 'Veteran', id: 'v3', bus: null } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].people[0].bus).to.equal('None');
            expect(response.pairs[1].people[0].bus).to.equal('None');
            expect(response.pairs[2].people[0].bus).to.equal('None');
            expect(response.stats.buses.None).to.equal(3);
        });

        it('should handle confirmed field correctly - empty means confirmed', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', confirmed: '' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Alpha1', confirmed: 'unconfirmed' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].people[0].confirmed).to.equal(true);
            expect(response.pairs[1].people[0].confirmed).to.equal(false);
        });

        it('should not flag missingPairedPerson for empty pairing', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlightDoc
            });

            const mockViewResult = {
                rows: [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: '' } }
                ]
            };

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await getFlightDetail(req, res);

            const response = res.json.firstCall.args[0];
            expect(response.pairs[0].pairId).to.equal('v1');  // Unpaired veteran uses own ID
            expect(response.pairs[0].missingPairedPerson).to.equal(false);
        });
    });
});
