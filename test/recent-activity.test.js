import { expect } from 'chai';
import sinon from 'sinon';
import { getRecentActivity } from '../routes/recent-activity.js';
import { DatabaseSessionError } from '../utils/db.js';

describe('Recent Activity Route Handler', () => {
    let req, res;

    beforeEach(() => {
        req = {
            query: {
                type: 'modified',
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

    describe('getRecentActivity', () => {
        describe('validation', () => {
            it('should return 400 when type parameter is missing', async () => {
                req.query = { offset: 0, limit: 20 };

                await getRecentActivity(req, res);

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.calledOnce).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('type parameter is required');
            });

            it('should return 400 when type parameter is empty', async () => {
                req.query.type = '';

                await getRecentActivity(req, res);

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('type parameter is required');
            });

            it('should return 400 when type parameter is invalid', async () => {
                req.query.type = 'invalid';

                await getRecentActivity(req, res);

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('type must be one of: modified, added, call, flight, pairing');
            });
        });

        describe('modified type', () => {
            it('should return recent activity entries successfully', async () => {
                const mockDbResult = {
                    total_rows: 2,
                    offset: 0,
                    rows: [
                        {
                            id: '0ccf1cdbac2279ae3e2de3791209c357',
                            key: '2025-12-29T01:04:40Z',
                            value: {
                                type: 'Guardian',
                                name: 'Catherine Manaspas',
                                city: 'Chippewa Falls, WI',
                                appdate: '2025-11-18',
                                recdate: '2025-12-29T01:04:40Z',
                                recby: 'Steve Schmechel',
                                change: 'changed flight from: None to: SSHF-Test01'
                            }
                        },
                        {
                            id: '0ccf1cdbac2279ae3e2de3791209b87a',
                            key: '2025-12-29T01:04:40Z',
                            value: {
                                type: 'Veteran',
                                name: 'Ronald Schnelberger',
                                city: 'Hartland, WI',
                                appdate: '2025-11-18',
                                recdate: '2025-12-29T01:04:40Z',
                                recby: 'Steve Schmechel',
                                change: 'changed flight from: None to: SSHF-Test01'
                            }
                        }
                    ]
                };

                global.fetch.resolves({
                    ok: true,
                    json: async () => mockDbResult
                });

                await getRecentActivity(req, res);

                expect(res.json.calledOnce).to.be.true;
                const response = res.json.firstCall.args[0];
                expect(response).to.be.an('array');
                expect(response).to.have.length(2);
                expect(response[0].id).to.equal('0ccf1cdbac2279ae3e2de3791209c357');
                expect(response[0].type).to.equal('Guardian');
                expect(response[0].name).to.equal('Catherine Manaspas');
                expect(response[0].city).to.equal('Chippewa Falls, WI');
                expect(response[0].appdate).to.equal('2025-11-18');
                expect(response[0].recdate).to.equal('2025-12-29T01:04:40Z');
                expect(response[0].recby).to.equal('Steve Schmechel');
                expect(response[0].change).to.equal('changed flight from: None to: SSHF-Test01');
                expect(response[1].id).to.equal('0ccf1cdbac2279ae3e2de3791209b87a');
                expect(response[1].type).to.equal('Veteran');
            });

            it('should call correct view URL for modified type', async () => {
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                expect(global.fetch.calledOnce).to.be.true;
                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/admin_recent_changes');
                expect(url).to.include('limit=20');
                expect(url).to.include('descending=true');
            });
        });

        describe('all activity types', () => {
            it('should call correct view URL for added type', async () => {
                req.query.type = 'added';
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/admin_recent_additions');
            });

            it('should call correct view URL for call type', async () => {
                req.query.type = 'call';
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/admin_recent_call_changes');
            });

            it('should call correct view URL for flight type', async () => {
                req.query.type = 'flight';
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/admin_recent_flight_changes');
            });

            it('should call correct view URL for pairing type', async () => {
                req.query.type = 'pairing';
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('/_design/basic/_view/admin_recent_pairing_changes');
            });
        });

        describe('pagination', () => {
            it('should use default offset of 0', async () => {
                delete req.query.offset;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.not.include('skip=');
            });

            it('should use default limit of 20', async () => {
                delete req.query.limit;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('limit=20');
            });

            it('should apply custom limit', async () => {
                req.query.limit = 50;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('limit=50');
            });

            it('should apply custom offset', async () => {
                req.query.offset = 40;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('skip=40');
            });

            it('should include skip parameter when offset is provided', async () => {
                req.query.offset = 10;
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ rows: [] })
                });

                await getRecentActivity(req, res);

                const url = global.fetch.firstCall.args[0];
                expect(url).to.include('skip=10');
            });
        });

        describe('error handling', () => {
            it('should return 500 when database returns error with reason', async () => {
                global.fetch.resolves({
                    ok: false,
                    json: async () => ({ reason: 'Database error occurred' })
                });

                await getRecentActivity(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('Database error occurred');
            });

            it('should return 500 when database returns error with error field', async () => {
                global.fetch.resolves({
                    ok: false,
                    json: async () => ({ error: 'not_found' })
                });

                await getRecentActivity(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('not_found');
            });

            it('should return 500 with default message when database returns empty error', async () => {
                global.fetch.resolves({
                    ok: false,
                    json: async () => ({})
                });

                await getRecentActivity(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('Failed to retrieve recent activity');
            });

            it('should return 503 for DatabaseSessionError', async () => {
                global.fetch.rejects(new DatabaseSessionError('Database session could not be established'));

                await getRecentActivity(req, res);

                expect(res.status.calledWith(503)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
            });

            it('should return 500 for generic errors during processing', async () => {
                global.fetch.resolves({
                    ok: true,
                    json: async () => { throw new Error('JSON parsing error'); }
                });

                await getRecentActivity(req, res);

                expect(res.status.calledWith(500)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal('JSON parsing error');
            });
        });

        describe('empty results', () => {
            it('should return empty array when no activity entries exist', async () => {
                global.fetch.resolves({
                    ok: true,
                    json: async () => ({ total_rows: 0, offset: 0, rows: [] })
                });

                await getRecentActivity(req, res);

                expect(res.json.calledOnce).to.be.true;
                const response = res.json.firstCall.args[0];
                expect(response).to.be.an('array');
                expect(response).to.have.length(0);
            });
        });
    });
});

