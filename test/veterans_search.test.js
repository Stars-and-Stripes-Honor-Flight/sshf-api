import { expect } from 'chai';
import sinon from 'sinon';
import { searchUnpairedVeterans } from '../routes/veterans.js';

describe('Veterans Search Route', () => {
    let req, res;

    beforeEach(() => {
        req = {
            query: {
                paired: false,
                status: 'Active',
                lastname: 'Smith',
                limit: 25
            },
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

    describe('searchUnpairedVeterans', () => {
        it('should return search results with default parameters', async () => {
            const mockDbResult = {
                total_rows: 1,
                offset: 0,
                rows: [{
                    id: 'doc1',
                    key: ['Active', 'SMITH'],
                    value: {
                        name: 'John Smith',
                        city: 'Chicago, IL',
                        flight: 'F23',
                        prefs: 'Prefers window seat'
                    }
                }]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response).to.have.length(1);
            expect(response[0].id).to.equal('doc1');
            expect(response[0].name).to.equal('John Smith');
            expect(response[0].city).to.equal('Chicago, IL');
            expect(response[0].flight).to.equal('F23');
            expect(response[0].prefs).to.equal('Prefers window seat');
        });

        it('should return search results with status filter', async () => {
            req.query.status = 'Flown';
            const mockDbResult = {
                total_rows: 2,
                offset: 0,
                rows: [{
                    id: 'doc1',
                    key: ['Flown', 'JONES'],
                    value: {
                        name: 'Jane Jones',
                        city: 'New York, NY',
                        flight: 'F24',
                        prefs: ''
                    }
                }, {
                    id: 'doc2',
                    key: ['Flown', 'JONES'],
                    value: {
                        name: 'Bob Jones',
                        city: 'Boston, MA',
                        flight: 'F24',
                        prefs: 'No preferences'
                    }
                }]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response).to.have.length(2);
            expect(response[0].name).to.equal('Jane Jones');
            expect(response[1].name).to.equal('Bob Jones');
        });

        it('should return search results with lastname filter', async () => {
            req.query.lastname = 'Brown';
            const mockDbResult = {
                total_rows: 1,
                offset: 0,
                rows: [{
                    id: 'doc3',
                    key: ['Active', 'BROWN'],
                    value: {
                        name: 'Charlie Brown',
                        city: 'Los Angeles, CA',
                        flight: 'F25',
                        prefs: 'Prefers aisle seat'
                    }
                }]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response).to.have.length(1);
            expect(response[0].name).to.equal('Charlie Brown');
            expect(response[0].city).to.equal('Los Angeles, CA');
            expect(response[0].flight).to.equal('F25');
            expect(response[0].prefs).to.equal('Prefers aisle seat');
        });

        it('should return search results with limit parameter', async () => {
            req.query.limit = 10;
            const mockDbResult = {
                total_rows: 5,
                offset: 0,
                rows: [{
                    id: 'doc1',
                    key: ['Active', 'SMITH'],
                    value: {
                        name: 'John Smith',
                        city: 'Chicago, IL',
                        flight: 'F23',
                        prefs: ''
                    }
                }]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            // Verify the limit was used in the query
            expect(global.fetch.calledOnce).to.be.true;
            const fetchUrl = global.fetch.firstCall.args[0];
            expect(fetchUrl).to.include('limit=10');
        });

        it('should return 501 Not Implemented when paired=true', async () => {
            req.query.paired = true;

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(501)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.error).to.include('Not Implemented');
            expect(response.error).to.include('paired=true');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 501 Not Implemented when paired="true" (string)', async () => {
            req.query.paired = 'true';

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(501)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.error).to.include('Not Implemented');
        });

        it('should handle database errors', async () => {
            global.fetch.rejects(new Error('Database connection error'));

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.error).to.equal('Database connection error');
        });

        it('should handle CouchDB error responses (4xx/5xx)', async () => {
            global.fetch.resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found', reason: 'View not found' })
            });

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            // data.reason takes priority over data.error, so it should be "View not found"
            expect(response.error).to.include('View not found');
        });

        it('should handle CouchDB error responses without reason field', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Internal server error' })
            });

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.error).to.include('Internal server error');
        });

        it('should handle CouchDB error responses with reason field', async () => {
            global.fetch.resolves({
                ok: false,
                status: 400,
                json: async () => ({ reason: 'Invalid query parameters' })
            });

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.error).to.include('Invalid query parameters');
        });

        it('should handle CouchDB error responses without reason or error fields', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await searchUnpairedVeterans(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.error).to.equal('Failed to search unpaired veterans');
        });

        it('should handle empty results', async () => {
            const mockDbResult = {
                total_rows: 0,
                offset: 0,
                rows: []
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array').that.is.empty;
        });

        it('should use default values when query parameters are missing', async () => {
            req.query = {};
            const mockDbResult = {
                total_rows: 0,
                offset: 0,
                rows: []
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            // Verify fetch was called (defaults should be used)
            expect(global.fetch.calledOnce).to.be.true;
            const fetchUrl = global.fetch.firstCall.args[0];
            expect(fetchUrl).to.include('unpaired_veterans_by_last_name');
        });

        it('should verify response structure matches emitted view format', async () => {
            const mockDbResult = {
                total_rows: 1,
                offset: 0,
                rows: [{
                    id: 'doc1',
                    key: ['Active', 'SMITH'],
                    value: {
                        name: 'John Smith',
                        city: 'Chicago, IL',
                        flight: 'F23',
                        prefs: 'Prefers window seat'
                    }
                }]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            const response = res.json.firstCall.args[0];
            
            // Verify structure is a simple array with id, name, city, flight, prefs
            expect(response).to.be.an('array');
            expect(response).to.have.length(1);
            expect(response[0]).to.have.property('id');
            expect(response[0]).to.have.property('name');
            expect(response[0]).to.have.property('city');
            expect(response[0]).to.have.property('flight');
            expect(response[0]).to.have.property('prefs');
        });

        it('should handle lastname with mixed case and convert to uppercase in query', async () => {
            req.query.lastname = 'sMiTh';
            const mockDbResult = {
                total_rows: 1,
                offset: 0,
                rows: [{
                    id: 'doc1',
                    key: ['Active', 'SMITH'],
                    value: {
                        name: 'John Smith',
                        city: 'Chicago, IL',
                        flight: 'F23',
                        prefs: ''
                    }
                }]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await searchUnpairedVeterans(req, res);

            expect(res.json.calledOnce).to.be.true;
            // Verify the query was built correctly (lastname should be uppercased in the query)
            expect(global.fetch.calledOnce).to.be.true;
            const fetchUrl = global.fetch.firstCall.args[0];
            // The URL should contain the uppercase version in the startkey
            expect(fetchUrl).to.include('SMITH');
        });

        it('should handle different status values', async () => {
            const statuses = ['Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction'];
            
            for (const status of statuses) {
                req.query.status = status;
                const mockDbResult = {
                    total_rows: 1,
                    offset: 0,
                    rows: [{
                        id: 'doc1',
                        key: [status, 'SMITH'],
                        value: {
                            name: 'John Smith',
                            city: 'Chicago, IL',
                            flight: 'F23',
                            prefs: ''
                        }
                    }]
                };

                global.fetch.resolves({
                    ok: true,
                    json: async () => mockDbResult
                });

                await searchUnpairedVeterans(req, res);

                const response = res.json.firstCall.args[0];
                expect(response).to.be.an('array');
                expect(response[0].id).to.equal('doc1');
                
                // Reset for next iteration
                sinon.restore();
                res.json = sinon.spy();
                res.status = sinon.stub().returnsThis();
                global.fetch = sinon.stub();
            }
        });
    });
});

