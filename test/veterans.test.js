import { expect } from 'chai';
import sinon from 'sinon';
import { createVeteran, retrieveVeteran, updateVeteran, deleteVeteran, updateVeteranSeat, updateVeteranBus } from '../routes/veterans.js';
import { DatabaseSessionError } from '../utils/db.js';

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

        it('should return 503 when database session cannot be established', async () => {
            // Simulate persistent 401 responses that exhaust retry attempts
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await createVeteran(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await retrieveVeteran(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await updateVeteran(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await deleteVeteran(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });
    });

    describe('updateVeteranSeat', () => {
        const mockVeteranDoc = {
            _id: 'vet-123',
            _rev: '1-abc',
            type: 'Veteran',
            flight: {
                id: 'SSHF-Nov2024',
                bus: 'Alpha1',
                seat: '10A',
                history: []
            },
            metadata: {
                created_at: '2024-01-01T00:00:00Z',
                created_by: 'Test User'
            }
        };

        it('should update veteran seat successfully', async () => {
            req.body = { value: '14B' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(mockVeteranDoc))
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'vet-123', rev: '2-xyz' }) };
            });

            await updateVeteranSeat(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.ok).to.equal(true);
            expect(response.seat).to.equal('14B');
            expect(savedDoc.flight.seat).to.equal('14B');
            expect(savedDoc.flight.history.length).to.equal(1);
            expect(savedDoc.flight.history[0].change).to.include('changed seat from: 10A to: 14B');
        });

        it('should update veteran seat with empty old value', async () => {
            req.body = { value: '5C' };
            const docWithoutSeat = {
                _id: 'vet-123',
                _rev: '1-abc',
                type: 'Veteran',
                flight: {
                    id: 'SSHF-Nov2024',
                    bus: 'Alpha1',
                    seat: '',
                    history: []
                },
                metadata: {}
            };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(docWithoutSeat))
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'vet-123', rev: '2-xyz' }) };
            });

            await updateVeteranSeat(req, res);

            expect(savedDoc.flight.history[0].change).to.include('changed seat from:  to: 5C');
        });

        it('should initialize flight and history if not present', async () => {
            req.body = { value: '7D' };
            const docWithoutFlight = { 
                _id: 'vet-123', 
                _rev: '1-abc', 
                type: 'Veteran' 
            };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => docWithoutFlight
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'vet-123', rev: '2-xyz' }) };
            });

            await updateVeteranSeat(req, res);

            expect(savedDoc.flight).to.be.an('object');
            expect(savedDoc.flight.seat).to.equal('7D');
            expect(savedDoc.flight.history).to.be.an('array');
        });

        it('should return 400 when value is missing', async () => {
            req.body = {};

            await updateVeteranSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('value is required');
        });

        it('should return 400 when value is null', async () => {
            req.body = { value: null };

            await updateVeteranSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 404 when veteran not found', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateVeteranSeat(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Veteran not found');
        });

        it('should return 400 when document is not a veteran', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Guardian' })
            });

            await updateVeteranSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a veteran record');
        });

        it('should return 500 when save fails', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockVeteranDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Conflict' })
            });

            await updateVeteranSeat(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Conflict');
        });

        it('should return 503 when database session cannot be established', async () => {
            req.body = { value: '14A' };
            
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await updateVeteranSeat(req, res);

            expect(res.status.calledWith(503)).to.be.true;
        });
    });

    describe('updateVeteranBus', () => {
        const mockVeteranDoc = {
            _id: 'vet-123',
            _rev: '1-abc',
            type: 'Veteran',
            flight: {
                id: 'SSHF-Nov2024',
                bus: 'Alpha1',
                seat: '10A',
                history: []
            },
            metadata: {
                created_at: '2024-01-01T00:00:00Z',
                created_by: 'Test User'
            }
        };

        it('should update veteran bus successfully', async () => {
            req.body = { value: 'Bravo3' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockVeteranDoc
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'vet-123', rev: '2-xyz' }) };
            });

            await updateVeteranBus(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.ok).to.equal(true);
            expect(response.bus).to.equal('Bravo3');
            expect(savedDoc.flight.bus).to.equal('Bravo3');
            expect(savedDoc.flight.history.length).to.equal(1);
            expect(savedDoc.flight.history[0].change).to.include('changed bus from: Alpha1 to: Bravo3');
        });

        it('should accept all valid bus values', async () => {
            const validBuses = ['None', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5', 'Bravo1', 'Bravo2', 'Bravo3', 'Bravo4', 'Bravo5'];
            
            for (const bus of validBuses) {
                req.body = { value: bus };
                
                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockVeteranDoc
                });

                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'vet-123', rev: '2-xyz' })
                });

                await updateVeteranBus(req, res);

                expect(res.json.called).to.be.true;
                const response = res.json.lastCall.args[0];
                expect(response.bus).to.equal(bus);
                
                sinon.restore();
                global.fetch = sinon.stub();
                res = {
                    status: sinon.stub().returnsThis(),
                    json: sinon.spy()
                };
            }
        });

        it('should return 400 for invalid bus value', async () => {
            req.body = { value: 'InvalidBus' };

            await updateVeteranBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Invalid bus value');
            expect(res.json.firstCall.args[0].error).to.include('None, Alpha1');
        });

        it('should return 400 when value is missing', async () => {
            req.body = {};

            await updateVeteranBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('value is required');
        });

        it('should initialize flight and history if not present', async () => {
            req.body = { value: 'Alpha2' };
            const docWithoutFlight = { 
                _id: 'vet-123', 
                _rev: '1-abc', 
                type: 'Veteran' 
            };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => docWithoutFlight
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'vet-123', rev: '2-xyz' }) };
            });

            await updateVeteranBus(req, res);

            expect(savedDoc.flight).to.be.an('object');
            expect(savedDoc.flight.bus).to.equal('Alpha2');
            expect(savedDoc.flight.history).to.be.an('array');
            expect(savedDoc.flight.history[0].change).to.include('changed bus from: None to: Alpha2');
        });

        it('should return 404 when veteran not found', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateVeteranBus(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should return 400 when document is not a veteran', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Flight' })
            });

            await updateVeteranBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 500 when save fails', async () => {
            req.body = { value: 'Bravo1' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockVeteranDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Database error' })
            });

            await updateVeteranBus(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should return 503 when database session cannot be established', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await updateVeteranBus(req, res);

            expect(res.status.calledWith(503)).to.be.true;
        });
    });
}); 