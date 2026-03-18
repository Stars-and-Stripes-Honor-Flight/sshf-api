import { expect } from 'chai';
import sinon from 'sinon';
import { getSearch } from '../routes/search.js';
import { DatabaseSessionError } from '../utils/db.js';

describe('Search Route', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            query: {
                status: 'Active',
                flight: 'All',
                lastname: 'Smith',
                limit: 25
            },
            dbCookie: 'auth-cookie'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        next = sinon.spy();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getSearch', () => {
        it('should return 400 when phone_num has fewer than 3 numeric digits', async () => {
            req.query = {
                ...req.query,
                phone_num: '12'
            };

            global.fetch = sinon.stub();

            await getSearch(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('phone_num must contain at least 3 numeric digits');
            expect(global.fetch.called).to.be.false;
        });

        it('should return search results', async () => {
            const mockDbResult = {
                total_rows: 1,
                offset: 0,
                rows: [{
                    id: '1',
                    key: ['Active', 'Smith'],
                    value: {
                        type: 'veteran',
                        name: 'John Smith',
                        phone: '217-555-1234',
                        city: 'Springfield',
                        status: 'Active'
                    }
                }]
            };

            // Mock the fetch function
            global.fetch = sinon.stub().resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await getSearch(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.total_rows).to.equal(1);
            expect(response.rows[0].value.name).to.equal('John Smith');
        });

        it('should filter phone search results by both status and flight', async () => {
            req.query = {
                limit: 25,
                lastname: 'Ignored',
                status: 'Active',
                flight: 'SSHF-Nov2024',
                phone_num: '(312) 555-1212'
            };

            const mockDbResult = {
                total_rows: 4,
                offset: 0,
                rows: [
                    {
                        id: '1',
                        key: ['3125551212'],
                        value: {
                            type: 'veteran',
                            name: 'John Smith',
                            phone: '(312) 555-1212',
                            city: 'Chicago, IL',
                            appdate: '2024-01-15',
                            flight: 'SSHF-Nov2024',
                            status: 'Active',
                            pairing: 'Jane Doe',
                            pairingId: 'g1'
                        }
                    },
                    {
                        id: '2',
                        key: ['3125551212'],
                        value: {
                            type: 'guardian',
                            name: 'Jane Doe',
                            phone: '(312) 555-1212',
                            city: 'Chicago, IL',
                            appdate: '2024-02-10',
                            flight: 'SSHF-Nov2024',
                            status: 'Flown',
                            pairing: 'John Smith',
                            pairingId: 'v1'
                        }
                    },
                    {
                        id: '3',
                        key: ['3125551212'],
                        value: {
                            type: 'veteran',
                            name: 'Bob Example',
                            phone: '(312) 555-1212',
                            city: 'Naperville, IL',
                            appdate: '2024-03-05',
                            flight: 'SSHF-Oct2024',
                            status: 'Active',
                            pairing: 'None',
                            pairingId: ''
                        }
                    },
                    {
                        id: '4',
                        key: ['3125551212'],
                        value: {
                            type: 'veteran',
                            name: 'Active Match',
                            phone: '(312) 555-1212',
                            city: 'Evanston, IL',
                            appdate: '2024-04-20',
                            flight: 'SSHF-Nov2024',
                            status: 'Active',
                            pairing: 'None',
                            pairingId: ''
                        }
                    }
                ]
            };

            global.fetch = sinon.stub().resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await getSearch(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.total_rows).to.equal(2);
            expect(response.rows).to.have.lengthOf(2);
            expect(response.rows[0].value.status).to.equal('Active');
            expect(response.rows[0].value.flight).to.equal('SSHF-Nov2024');
            expect(response.rows[0].value.phone).to.equal('(312) 555-1212');
            expect(response.rows[1].value.status).to.equal('Active');
            expect(response.rows[1].value.flight).to.equal('SSHF-Nov2024');
            expect(response.rows[1].value.phone).to.equal('(312) 555-1212');
        });

        it('should handle phone search responses with missing rows', async () => {
            req.query = {
                limit: 25,
                lastname: 'Ignored',
                status: 'All',
                flight: 'All',
                phone_num: '(312) 555-1212'
            };

            const mockDbResult = {
                total_rows: 0,
                offset: 0
            };

            global.fetch = sinon.stub().resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await getSearch(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.total_rows).to.equal(0);
            expect(response.rows).to.deep.equal([]);
        });

        it('should handle database errors', async () => {
            // Network errors are now retried, and after 3 retries result in 503
            global.fetch = sinon.stub().rejects(new Error('Database error'));

            await getSearch(req, res, next);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should return 503 when database session cannot be established', async () => {
            global.fetch = sinon.stub().resolves({
                ok: false,
                status: 401
            });

            await getSearch(req, res, next);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should return 500 for non-session errors', async () => {
            // Simulate a successful fetch but json() throws an error
            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => { throw new Error('Invalid JSON response'); }
            });

            await getSearch(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid JSON response');
        });
    });
}); 