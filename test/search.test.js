import { expect } from 'chai';
import sinon from 'sinon';
import { getSearch } from '../routes/search.js';

describe('Search Route', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            query: {
                status: 'Active',
                flight: 'All',
                lastname: 'Smith',
                limit: 25
            }
        };
        res = {
            json: sinon.spy()
        };
        next = sinon.spy();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getSearch', () => {
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

        it('should handle database errors', async () => {
            global.fetch = sinon.stub().rejects(new Error('Database error'));

            try {
                await getSearch(req, res, next);
            } catch (error) {
                expect(error.message).to.equal('Database error');
            }
        });
    });
}); 