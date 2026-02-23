import { expect } from 'chai';
import sinon from 'sinon';
import { getWaitlistVeteranGroups } from '../routes/waitlist-veteran-groups.js';
import { DatabaseSessionError } from '../utils/db.js';

describe('Waitlist Veteran Groups Route Handler', () => {
    let req, res;

    beforeEach(() => {
        req = {
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

    describe('getWaitlistVeteranGroups', () => {
        it('should group rows by key and return names arrays', async () => {
            const mockDbResult = {
                total_rows: 4,
                offset: 0,
                rows: [
                    { id: '1', key: '853-3', value: 'William Mathias (SSHF-Mark1)' },
                    { id: '2', key: '853-3', value: 'Robert Kossow (SSHF-Mark1)' },
                    { id: '3', key: '855-2', value: 'Philip Schultz' },
                    { id: '4', key: '855-2', value: 'Norman Carlson' }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await getWaitlistVeteranGroups(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.deep.equal([
                {
                    group: '853-3',
                    names: ['William Mathias (SSHF-Mark1)', 'Robert Kossow (SSHF-Mark1)']
                },
                {
                    group: '855-2',
                    names: ['Philip Schultz', 'Norman Carlson']
                }
            ]);
        });

        it('should sort groups ascending in API response', async () => {
            const mockDbResult = {
                rows: [
                    { id: '1', key: '900-1', value: 'Name 1' },
                    { id: '2', key: '853-3', value: 'Name 2' },
                    { id: '3', key: '899-2', value: 'Name 3' }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockDbResult
            });

            await getWaitlistVeteranGroups(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.map(group => group.group)).to.deep.equal(['853-3', '899-2', '900-1']);
        });

        it('should call waitlist_veteran_groups view with descending=false', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ rows: [] })
            });

            await getWaitlistVeteranGroups(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            const url = global.fetch.firstCall.args[0];
            expect(url).to.include('/_design/basic/_view/waitlist_veteran_groups');
            expect(url).to.include('descending=false');
        });

        it('should return empty array when no rows are returned', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ total_rows: 0, offset: 0, rows: [] })
            });

            await getWaitlistVeteranGroups(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.deep.equal([]);
        });

        it('should return empty array when rows is missing from response', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ total_rows: 0, offset: 0 })
            });

            await getWaitlistVeteranGroups(req, res);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.deep.equal([]);
        });

        it('should return 500 when database returns error with reason', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({ reason: 'Database error occurred' })
            });

            await getWaitlistVeteranGroups(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Database error occurred');
        });

        it('should return 500 when database returns error with no reason', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({})
            });

            await getWaitlistVeteranGroups(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to retrieve veteran groups');
        });

        it('should return 503 for DatabaseSessionError', async () => {
            global.fetch.rejects(new DatabaseSessionError('Database session could not be established'));

            await getWaitlistVeteranGroups(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });
    });
});
