import { expect } from 'chai';
import sinon from 'sinon';
import { getWaitlist } from '../routes/waitlist.js';
import { DatabaseSessionError } from '../utils/db.js';

describe('Waitlist Route Handler', () => {
    let req, res;

    beforeEach(() => {
        req = {
            query: {
                type: 'veterans',
                offset: 0,
                limit: 20
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

    describe('getWaitlist', () => {
        describe('validation', () => {
            it('should return 400 when type parameter is missing', async () => {
                req.query = { offset: 0, limit: 20 };

                await getWaitlist(req, res);

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.calledOnce).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('type parameter is required');
            });

            it('should return 400 when type parameter is empty', async () => {
                req.query.type = '';

                await getWaitlist(req, res);

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('type parameter is required');
            });

            it('should return 400 when type parameter is invalid', async () => {
                req.query.type = 'invalid';

                await getWaitlist(req, res);

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('type must be either "veterans" or "guardians"');
            });
        });

        describe('veterans waitlist', () => {
            it('should return veteran records successfully', async () => {
                const mockDbResult = {
                    total_rows: 2,
                    offset: 0,
                    rows: [
                        {
                            id: 'vet1',
                            key: ['2024-01-01'],
                            doc: {
                                _id: 'vet1',
                                _rev: '1-abc',
                                type: 'Veteran',
                                name: { first: 'John', last: 'Smith' },
                                address: {
                                    street: '123 Main St',
                                    city: 'Chicago',
                                    state: 'IL',
                                    zip: '60601',
                                    county: 'Cook',
                                    phone_day: '312-555-1234'
                                }
                            }
                        },
                        {
                            id: 'vet2',
                            key: ['2024-01-02'],
                            doc: {
                                _id: 'vet2',
                                _rev: '1-def',
                                type: 'Veteran',
                                name: { first: 'Jane', last: 'Doe' },
                                address: {
                                    street: '456 Oak Ave',
                                    city: 'Springfield',
                                    state: 'IL',
                                    zip: '62701',
                                    county: 'Sangamon',
                                    phone_day: '217-555-5678'
                                }
                            }
                        }
                    ]
                };

                global.fetch.resolves({
                    ok: true,
                    json: async () => mockDbResult
                });

                await getWaitlist(req, res);

                expect(res.json.calledOnce).to.be.true;
                const response = res.json.firstCall.args[0];
                expect(response).to.be.an('array');
                expect(response).to.have.length(2);
                expect(response[0]._id).to.equal('vet1');
                expect(response[0].type).to.equal('Veteran');
                expect(response[0].name.first).to.equal('John');
                expect(response[0].name.last).to.equal('Smith');
                expect(response[1]._id).to.equal('vet2');
                expect(response[1].name.first).to.equal('Jane');
            });

            it('should call correct view URL for veterans', async () => {
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                expect(global.fetch.calledOnce).to.be.true;
                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/waitlist_veterans');
                expect(url).to.include('include_docs=true');
                expect(url).to.include('limit=20');
            });

            it('should include skip parameter when offset is provided', async () => {
                req.query.offset = 10;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('skip=10');
            });
        });

        describe('guardians waitlist', () => {
            it('should return guardian records successfully', async () => {
                req.query.type = 'guardians';
                const mockDbResult = {
                    total_rows: 1,
                    offset: 0,
                    rows: [
                        {
                            id: 'guard1',
                            key: ['2024-01-01'],
                            doc: {
                                _id: 'guard1',
                                _rev: '1-xyz',
                                type: 'Guardian',
                                name: { first: 'Bob', last: 'Wilson' },
                                address: {
                                    street: '789 Pine St',
                                    city: 'Peoria',
                                    state: 'IL',
                                    zip: '61602',
                                    county: 'Peoria',
                                    phone_day: '309-555-9012'
                                }
                            }
                        }
                    ]
                };

                global.fetch.resolves({
                    ok: true,
                    json: async () => mockDbResult
                });

                await getWaitlist(req, res);

                expect(res.json.calledOnce).to.be.true;
                const response = res.json.firstCall.args[0];
                expect(response).to.be.an('array');
                expect(response).to.have.length(1);
                expect(response[0]._id).to.equal('guard1');
                expect(response[0].type).to.equal('Guardian');
                expect(response[0].name.first).to.equal('Bob');
                expect(response[0].name.last).to.equal('Wilson');
            });

            it('should call correct view URL for guardians', async () => {
                req.query.type = 'guardians';
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                expect(global.fetch.calledOnce).to.be.true;
                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/waitlist_guardians');
            });
        });

        describe('pagination', () => {
            it('should use default offset of 0', async () => {
                delete req.query.offset;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.not.include('skip=');
            });

            it('should use default limit of 20', async () => {
                delete req.query.limit;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('limit=20');
            });

            it('should apply custom limit', async () => {
                req.query.limit = 50;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('limit=50');
            });

            it('should apply custom offset', async () => {
                req.query.offset = 40;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getWaitlist(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('skip=40');
            });
        });

        describe('error handling', () => {
            it('should return 500 when database returns error with reason', async () => {
                global.fetch.resolves({
                    ok: false,
                    json: async () => ({ reason: 'Database error occurred' })
                });

                await getWaitlist(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('Database error occurred');
            });

            it('should return 500 when database returns error with error field', async () => {
                global.fetch.resolves({
                    ok: false,
                    json: async () => ({ error: 'not_found' })
                });

                await getWaitlist(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('not_found');
            });

            it('should return 500 with default message when database returns empty error', async () => {
                global.fetch.resolves({
                    ok: false,
                    json: async () => ({})
                });

                await getWaitlist(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('Failed to retrieve waitlist');
            });

            it('should return 503 for DatabaseSessionError', async () => {
                global.fetch.rejects(new DatabaseSessionError('Database session could not be established'));

                await getWaitlist(req, res);

                expect(res.status.calledWith(503)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
            });

            it('should return 500 for generic errors during processing', async () => {
                // Simulate an error during JSON parsing/processing
                global.fetch.resolves({
                    ok: true,
                    json: async () => { throw new Error('JSON parsing error'); }
                });

                await getWaitlist(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('JSON parsing error');
            });
        });

        describe('empty results', () => {
            it('should return empty array when no waitlist entries exist', async () => {
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ total_rows: 0, offset: 0, rows: [] })
                });

                await getWaitlist(req, res);

                expect(res.json.calledOnce).to.be.true;
                const response = res.json.firstCall.args[0];
                expect(response).to.be.an('array');
                expect(response).to.have.length(0);
            });
        });
    });
});

