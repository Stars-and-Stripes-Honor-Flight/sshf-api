import { expect } from 'chai';
import sinon from 'sinon';
import { createGuardian, retrieveGuardian, updateGuardian, deleteGuardian } from '../routes/guardians.js';

describe('Guardians Route Handlers', () => {
    let req, res;
    const baseSampleData = {
        type: 'Guardian',
        name: {
            first: 'Jane',
            last: 'Doe'
        },
        address: {
            street: '456 Oak St',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
            county: 'Sangamon',
            phone_day: '217-555-5678'
        }
    };

    beforeEach(() => {
        // Deep clone the sample data for each test
        const sampleGuardianData = JSON.parse(JSON.stringify(baseSampleData));
        
        req = {
            params: { id: 'test-id' },
            body: sampleGuardianData,
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

    describe('createGuardian', () => {
        it('should create a new guardian record', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });

            await createGuardian(req, res);

            expect(res.status.calledWith(201)).to.be.true;
            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._id).to.equal('new-id');
        });

        it('should handle validation errors', async () => {
            const invalidData = JSON.parse(JSON.stringify(baseSampleData));
            invalidData.name.first = '12';
            req.body = invalidData;

            try {
                await createGuardian(req, res);
                expect.fail('Expected validation error to be thrown');
            } catch (error) {
                console.log('Test error details:', {
                    error: error.message,
                    stack: error.stack,
                    responseStatus: res.status.args,
                    responseJson: res.json.args
                });
                
                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.include('Validation failed');
            }
        });

        it('should handle database errors', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({ reason: 'Database error' })
            });

            await createGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should handle database errors without reason', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({})  // Empty response with no reason
            });

            await createGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to create guardian document');
        });
    });

    describe('retrieveGuardian', () => {
        it('should retrieve an existing guardian', async () => {
            const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
            mockGuardian._id = 'test-id';
            mockGuardian.type = 'Guardian';

            global.fetch.resolves({
                ok: true,
                json: async () => mockGuardian
            });

            await retrieveGuardian(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.name.first).to.equal('Jane');
        });

        it('should handle non-guardian documents', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ _id: 'test-id', type: 'Veteran' })
            });

            await retrieveGuardian(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a guardian record');
        });

        it('should handle not found errors', async () => {
            global.fetch.resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await retrieveGuardian(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database errors during retrieval', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await retrieveGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database error');
        });

        it('should handle database errors without reason during retrieval', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await retrieveGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian');
        });
    });

    describe('updateGuardian', () => {
        beforeEach(() => {
            const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
            mockGuardian._id = 'test-id';
            mockGuardian._rev = '1-abc';
            mockGuardian.type = 'Guardian';

            // Mock the initial GET request
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockGuardian
            });
        });

        it('should update an existing guardian', async () => {
            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ id: 'test-id', rev: '2-def' })
            });

            await updateGuardian(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._rev).to.equal('2-def');
        });

        it('should handle validation errors', async () => {
            req.body.name.first = '12'; // Invalid name

            await updateGuardian(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
        });

        it('should handle not found errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database update errors', async () => {
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Update failed' })
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Update failed');
        });

        it('should handle database update errors when no reason is provided', async () => {
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: '' })
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to update guardian');
        });

        it('should handle non-guardian documents during update', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    type: 'Veteran'
                })
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a guardian record');
        });

        it('should handle database errors during initial get', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian for update');
        });

        it('should handle database errors without reason during initial get', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian for update');
        });
    });

    describe('deleteGuardian', () => {
        beforeEach(() => {
            // Mock the initial GET request
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id', 
                    _rev: '1-abc',
                    type: 'Guardian'
                })
            });
        });

        it('should delete an existing guardian', async () => {
            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ ok: true, id: 'test-id', rev: '2-def' })
            });

            await deleteGuardian(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.ok).to.be.true;
        });

        it('should handle non-guardian documents', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'test-id', type: 'Veteran' })
            });

            await deleteGuardian(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a guardian record');
        });

        it('should handle not found errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await deleteGuardian(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database delete errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    _rev: '1-abc',
                    type: 'Guardian'
                })
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Delete failed' })
            });

            await deleteGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Delete failed');
        });

        it('should handle database delete errors when no reason is provided', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    _rev: '1-abc',
                    type: 'Guardian'
                })
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: '' })
            });

            await deleteGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to delete guardian');
        });

        it('should handle initial get errors during delete', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Get failed' })
            });

            await deleteGuardian(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian for deletion');
        });
    });
}); 