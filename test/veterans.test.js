import { expect } from 'chai';
import sinon from 'sinon';
import { createVeteran, retrieveVeteran, updateVeteran, deleteVeteran } from '../routes/veterans.js';

describe('Veterans Route Handlers', () => {
    let req, res;
    const baseSampleData = {
        type: 'Veteran',
        name: {
            first: 'John',
            last: 'Smith'
        },
        address: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
            county: 'Sangamon',
            phone_day: '217-555-1234'
        }
    };

    beforeEach(() => {
        // Deep clone the sample data for each test
        const sampleVeteranData = JSON.parse(JSON.stringify(baseSampleData));
        
        req = {
            params: { id: 'test-id' },
            body: sampleVeteranData,
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

    describe('createVeteran', () => {
        it('should create a new veteran record', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });

            await createVeteran(req, res);

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
                await createVeteran(req, res);
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

            await createVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should handle database errors without reason', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({})  // Empty response with no reason
            });

            await createVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to create veteran document');
        });
    });

    describe('retrieveVeteran', () => {
        it('should retrieve an existing veteran', async () => {
            const mockVeteran = JSON.parse(JSON.stringify(baseSampleData));
            mockVeteran._id = 'test-id';
            mockVeteran.type = 'Veteran';

            global.fetch.resolves({
                ok: true,
                json: async () => mockVeteran
            });

            await retrieveVeteran(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.name.first).to.equal('John');
        });

        it('should handle non-veteran documents', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ _id: 'test-id', type: 'Guardian' })
            });

            await retrieveVeteran(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a veteran record');
        });

        it('should handle not found errors', async () => {
            global.fetch.resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await retrieveVeteran(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database errors during retrieval', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await retrieveVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database error');
        });

        it('should handle database errors without reason during retrieval', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await retrieveVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get veteran');
        });
    });

    describe('updateVeteran', () => {
        beforeEach(() => {
            const mockVeteran = JSON.parse(JSON.stringify(baseSampleData));
            mockVeteran._id = 'test-id';
            mockVeteran._rev = '1-abc';
            mockVeteran.type = 'Veteran';

            // Mock the initial GET request
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockVeteran
            });
        });

        it('should update an existing veteran', async () => {
            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ id: 'test-id', rev: '2-def' })
            });

            await updateVeteran(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._rev).to.equal('2-def');
        });

        it('should handle validation errors', async () => {
            req.body.name.first = '12'; // Invalid name

            await updateVeteran(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
        });

        it('should handle not found errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database update errors', async () => {
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Update failed' })
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Update failed');
        });

        it('should handle database update errors when no reason is provided', async () => {
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: '' })
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to update veteran');
        });

        it('should handle non-veteran documents during update', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    type: 'Guardian'
                })
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a veteran record');
        });

        it('should handle database errors during initial get', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get veteran for update');
        });

        it('should handle database errors without reason during initial get', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get veteran for update');
        });

        it('should preserve server-controlled fields during update', async () => {
            // Mock current document with server-controlled fields
            const currentDoc = {
                _id: 'test-id',
                _rev: '1-abc',
                type: 'Veteran',
                name: { first: 'John', last: 'Smith' },
                address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                metadata: {
                    created_at: '2023-01-01T12:00:00Z',
                    created_by: 'Original User',
                    updated_at: '2023-01-01T12:00:00Z',
                    updated_by: 'Original User'
                },
                flight: {
                    history: [{ id: '2023-01-01T12:00:00Z', change: 'Original flight assignment' }]
                },
                guardian: {
                    history: [{ id: '2023-01-01T12:00:00Z', change: 'Original guardian assignment' }]
                },
                call: {
                    history: [{ id: '2023-01-01T12:00:00Z', change: 'Original call assignment' }]
                }
            };

            // Client tries to overwrite server-controlled fields
            req.body = {
                type: 'Guardian', // Try to change type
                metadata: {
                    created_at: '2024-01-01T12:00:00Z', // Try to change creation metadata
                    created_by: 'Hacker User'
                },
                flight: {
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Hacked flight history' }]
                },
                guardian: {
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Hacked guardian history' }]
                },
                call: {
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Hacked call history' }]
                },
                name: { first: 'Jane', last: 'Doe' }, // Valid change
                address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' } // Required fields
            };

            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => currentDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ id: 'test-id', rev: '2-def' })
            });

            await updateVeteran(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            
            // Verify server-controlled fields are preserved
            expect(response.type).to.equal('Veteran'); // Should remain "Veteran"
            expect(response.metadata.created_at).to.equal('2023-01-01T12:00:00Z'); // Should be preserved
            expect(response.metadata.created_by).to.equal('Original User'); // Should be preserved
            expect(response.flight.history).to.deep.equal([{ id: '2023-01-01T12:00:00Z', change: 'Original flight assignment' }]); // Should be preserved
            expect(response.guardian.history).to.deep.equal([{ id: '2023-01-01T12:00:00Z', change: 'Original guardian assignment' }]); // Should be preserved
            expect(response.call.history).to.deep.equal([{ id: '2023-01-01T12:00:00Z', change: 'Original call assignment' }]); // Should be preserved
            
            // Verify client changes are applied to non-server-controlled fields
            expect(response.name.first).to.equal('Jane');
            expect(response.name.last).to.equal('Doe');
            
            // Verify updated_at and updated_by are set by prepareForSave
            expect(response.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(response.metadata.updated_by).to.equal('Admin User');
        });
    });

    describe('deleteVeteran', () => {
        beforeEach(() => {
            // Mock the initial GET request
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id', 
                    _rev: '1-abc',
                    type: 'Veteran'
                })
            });
        });

        it('should delete an existing veteran', async () => {
            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ ok: true, id: 'test-id', rev: '2-def' })
            });

            await deleteVeteran(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.ok).to.be.true;
        });

        it('should handle non-veteran documents', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'test-id', type: 'Guardian' })
            });

            await deleteVeteran(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a veteran record');
        });

        it('should handle not found errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await deleteVeteran(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database delete errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    _rev: '1-abc',
                    type: 'Veteran'
                })
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Delete failed' })
            });

            await deleteVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Delete failed');
        });

        it('should handle database delete errors when no reason is provided', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    _rev: '1-abc',
                    type: 'Veteran'
                })
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: '' })
            });

            await deleteVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to delete veteran');
        });

        it('should handle initial get errors during delete', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Get failed' })
            });

            await deleteVeteran(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get veteran for deletion');
        });
    });
}); 