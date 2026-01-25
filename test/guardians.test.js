import { expect } from 'chai';
import sinon from 'sinon';
import { createGuardian, retrieveGuardian, updateGuardian, deleteGuardian, updateGuardianSeat, updateGuardianBus } from '../routes/guardians.js';
import { DatabaseSessionError } from '../utils/db.js';

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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await createGuardian(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await retrieveGuardian(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await updateGuardian(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should preserve server-controlled fields during update', async () => {
            // Mock current document with server-controlled fields
            const currentDoc = {
                _id: 'test-id',
                _rev: '1-abc',
                type: 'Guardian',
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
                veteran: {
                    history: [{ id: '2023-01-01T12:00:00Z', change: 'Original veteran assignment' }]
                },
                call: {
                    history: [{ id: '2023-01-01T12:00:00Z', change: 'Original call assignment' }]
                }
            };

            // Client tries to overwrite server-controlled fields
            req.body = {
                type: 'Veteran', // Try to change type
                metadata: {
                    created_at: '2024-01-01T12:00:00Z', // Try to change creation metadata
                    created_by: 'Hacker User'
                },
                flight: {
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Hacked flight history' }]
                },
                veteran: {
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Hacked veteran history' }]
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

            await updateGuardian(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            
            // Verify server-controlled fields are preserved
            expect(response.type).to.equal('Guardian'); // Should remain "Guardian"
            expect(response.metadata.created_at).to.equal('2023-01-01T12:00:00Z'); // Should be preserved
            expect(response.metadata.created_by).to.equal('Original User'); // Should be preserved
            expect(response.flight.history).to.deep.equal([{ id: '2023-01-01T12:00:00Z', change: 'Original flight assignment' }]); // Should be preserved
            expect(response.veteran.history).to.deep.equal([{ id: '2023-01-01T12:00:00Z', change: 'Original veteran assignment' }]); // Should be preserved
            expect(response.call.history).to.deep.equal([{ id: '2023-01-01T12:00:00Z', change: 'Original call assignment' }]); // Should be preserved
            
            // Verify client changes are applied to non-server-controlled fields
            expect(response.name.first).to.equal('Jane');
            expect(response.name.last).to.equal('Doe');
            
            // Verify updated_at and updated_by are set by prepareForSave
            expect(response.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(response.metadata.updated_by).to.equal('Admin User');
        });

        describe('veteran pairing synchronization', () => {
            beforeEach(() => {
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: []
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockGuardian
                });
            });

            it('should add a veteran to pairings and update veteran record', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: {
                        id: '',
                        name: '',
                        pref_notes: '',
                        history: []
                    },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: {
                        created_at: '2023-01-01T12:00:00Z',
                        created_by: 'Test User'
                    }
                };

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: veteranId, rev: '2-xyz' })
                });

                // Mock guardian PUT request (4th call: GET guardian, GET veteran, PUT veteran, PUT guardian)
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(res.json.called).to.be.true;
                const response = res.json.firstCall.args[0];
                
                // Verify guardian history was updated
                const pairingHistory = response.veteran.history.filter(h => 
                    h.change.includes('paired to:') && h.change.includes(veteranName)
                );
                expect(pairingHistory.length).to.equal(1);
                expect(pairingHistory[0].change).to.include('paired to:');
                expect(pairingHistory[0].change).to.include(veteranName);
                expect(pairingHistory[0].change).to.include('Admin User');

                // Verify veteran was fetched and updated
                expect(global.fetch.callCount).to.be.at.least(3);
            });

            it('should remove a veteran from pairings and update veteran record', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: {
                        id: 'guardian-id',
                        name: 'Jane Doe',
                        pref_notes: '',
                        history: []
                    },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: {
                        created_at: '2023-01-01T12:00:00Z',
                        created_by: 'Test User'
                    }
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockGuardian
                });

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: []
                };

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: veteranId, rev: '2-xyz' })
                });

                // Mock guardian PUT request (4th call: GET guardian, GET veteran, PUT veteran, PUT guardian)
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(res.json.called).to.be.true;
                const response = res.json.firstCall.args[0];
                
                // Verify guardian history was updated
                const unpairingHistory = response.veteran.history.filter(h => 
                    h.change.includes('unpaired from:') && h.change.includes(veteranName)
                );
                expect(unpairingHistory.length).to.equal(1);
                expect(unpairingHistory[0].change).to.include('unpaired from:');
                expect(unpairingHistory[0].change).to.include(veteranName);
                expect(unpairingHistory[0].change).to.include('Admin User');
            });

            it('should handle multiple veterans added to pairings', async () => {
                const veteran1Id = 'veteran-id-1';
                const veteran1Name = 'John Veteran';
                const veteran2Id = 'veteran-id-2';
                const veteran2Name = 'Jane Veteran';

                const mockVeteran1 = {
                    _id: veteran1Id,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: { id: '', name: '', pref_notes: '', history: [] },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: { created_at: '2023-01-01T12:00:00Z', created_by: 'Test User' }
                };

                const mockVeteran2 = {
                    _id: veteran2Id,
                    _rev: '1-abc',
                    type: 'Veteran',
                    name: { first: 'Jane', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: { id: '', name: '', pref_notes: '', history: [] },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: { created_at: '2023-01-01T12:00:00Z', created_by: 'Test User' }
                };

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteran1Id, name: veteran1Name },
                        { id: veteran2Id, name: veteran2Name }
                    ]
                };

                // Mock veteran GET requests
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran1
                });

                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: veteran1Id, rev: '2-xyz' })
                });

                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => mockVeteran2
                });

                global.fetch.onCall(4).resolves({
                    ok: true,
                    json: async () => ({ id: veteran2Id, rev: '2-abc' })
                });

                // Mock guardian PUT request (5th call: GET guardian, GET vet1, PUT vet1, GET vet2, PUT vet2, PUT guardian)
                global.fetch.onCall(5).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(res.json.called).to.be.true;
                const response = res.json.firstCall.args[0];
                
                // Verify both veterans are in history
                const pairingHistory = response.veteran.history.filter(h => 
                    h.change.includes('paired to:')
                );
                expect(pairingHistory.length).to.equal(2);
            });

            it('should handle veteran not found error gracefully', async () => {
                const veteranId = 'non-existent-veteran';
                
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: 'Non Existent' }
                    ]
                };

                // Mock veteran GET request returning 404
                global.fetch.onSecondCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                });

                // Mock guardian PUT request (3rd call: GET guardian, GET veteran (404), PUT guardian)
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
                // Status defaults to 200 if not explicitly set, so check that json was called (success)
                // res.status is not called on success, so we just verify json was called
            });

            it('should handle veteran update failure gracefully', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: { id: '', name: '', pref_notes: '', history: [] },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: { created_at: '2023-01-01T12:00:00Z', created_by: 'Test User' }
                };

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request failing
                global.fetch.onThirdCall().resolves({
                    ok: false,
                    json: async () => ({ reason: 'Update conflict' })
                });

                // Mock guardian PUT request (4th call: GET guardian, GET veteran, PUT veteran (fail), PUT guardian)
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
                // Status defaults to 200 if not explicitly set, so check that json was called (success)
                // res.status is not called on success, so we just verify json was called
            });

            it('should handle veteran GET error (non-404)', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request returning 500 error
                global.fetch.onSecondCall().resolves({
                    ok: false,
                    status: 500,
                    json: async () => ({ reason: 'Database error' })
                });

                // Mock guardian PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
            });

            it('should handle veteran GET error without reason field', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request returning 500 error without reason
                global.fetch.onSecondCall().resolves({
                    ok: false,
                    status: 500,
                    json: async () => ({}) // No reason field
                });

                // Mock guardian PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
            });

            it('should handle non-veteran document type error', async () => {
                const veteranId = 'guardian-id-1'; // Using a guardian ID to simulate wrong type
                const veteranName = 'John Guardian';
                
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request returning a Guardian document (wrong type)
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => ({
                        _id: veteranId,
                        _rev: '1-xyz',
                        type: 'Guardian', // Wrong type
                        name: { first: 'John', last: 'Guardian' }
                    })
                });

                // Mock guardian PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
            });

            it('should handle exception in updateVeteranGuardianReference', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request to throw an error
                global.fetch.onSecondCall().rejects(new Error('Network error'));

                // Mock guardian PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
            });

            it('should handle veteran removal failure gracefully', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: {
                        id: 'guardian-id',
                        name: 'Jane Doe',
                        pref_notes: '',
                        history: []
                    },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: {
                        created_at: '2023-01-01T12:00:00Z',
                        created_by: 'Test User'
                    }
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockGuardian
                });

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: []
                };

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request failing
                global.fetch.onThirdCall().resolves({
                    ok: false,
                    json: async () => ({ reason: 'Update conflict' })
                });

                // Mock guardian PUT request
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
            });

            it('should handle missing veteran.pairings in current guardian', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                // veteran.pairings is undefined (not set)
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: []
                    // pairings is missing
                };
                
                // After Guardian.fromJSON, manually set pairings to undefined to test fallback
                const currentGuardianDoc = mockGuardian;

                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: { id: '', name: '', pref_notes: '', history: [] },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: { created_at: '2023-01-01T12:00:00Z', created_by: 'Test User' }
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => {
                        // Return document without veteran.pairings to test fallback on line 358
                        // Note: Guardian.fromJSON will initialize it to [], but the || [] fallback is defensive
                        const doc = JSON.parse(JSON.stringify(mockGuardian));
                        if (doc.veteran) {
                            delete doc.veteran.pairings;
                        }
                        return doc;
                    }
                });

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: veteranId, rev: '2-xyz' })
                });

                // Mock guardian PUT request
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(res.json.called).to.be.true;
            });

            it('should handle missing veteran.pairings in updated guardian', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: {
                        id: 'guardian-id',
                        name: 'Jane Doe',
                        pref_notes: '',
                        history: []
                    },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: { created_at: '2023-01-01T12:00:00Z', created_by: 'Test User' }
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockGuardian
                });

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: []
                    // pairings is missing (undefined) - this will test the || [] fallback on line 359
                };
                // Explicitly ensure pairings is not set to test fallback
                delete req.body.veteran.pairings;

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request
                global.fetch.onThirdCall().resolves({
                    ok: true,
                    json: async () => ({ id: veteranId, rev: '2-xyz' })
                });

                // Mock guardian PUT request
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(res.json.called).to.be.true;
            });

            it('should handle veteran update error without reason field', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockVeteran = {
                    _id: veteranId,
                    _rev: '1-xyz',
                    type: 'Veteran',
                    name: { first: 'John', last: 'Veteran' },
                    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', county: 'Sangamon', phone_day: '217-555-1234' },
                    guardian: { id: '', name: '', pref_notes: '', history: [] },
                    flight: { history: [] },
                    call: { history: [] },
                    metadata: { created_at: '2023-01-01T12:00:00Z', created_by: 'Test User' }
                };

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock veteran GET request
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => mockVeteran
                });

                // Mock veteran PUT request failing without reason field
                global.fetch.onThirdCall().resolves({
                    ok: false,
                    json: async () => ({}) // No reason field
                });

                // Mock guardian PUT request
                global.fetch.onCall(3).resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                // Should still succeed but log warning
                expect(res.json.called).to.be.true;
            });

            it('should not update veteran records if guardian validation fails', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: []
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockGuardian
                });

                // Create a request that will fail validation (missing required address fields)
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.address = {}; // Invalid - missing required fields, will fail validation
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                await updateGuardian(req, res);

                // Should fail validation and return 400 error
                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.called).to.be.true;
                
                // Verify that veteran update was NOT called (only guardian GET was called)
                // If validation happens after veteran updates, there would be 2+ fetch calls
                // But if validation happens before, there should only be 1 fetch call (GET guardian)
                expect(global.fetch.callCount).to.equal(1);
            });

            it('should not update veterans when pairings are unchanged', async () => {
                const veteranId = 'veteran-id-1';
                const veteranName = 'John Veteran';
                
                const mockGuardian = JSON.parse(JSON.stringify(baseSampleData));
                mockGuardian._id = 'guardian-id';
                mockGuardian._rev = '1-abc';
                mockGuardian.type = 'Guardian';
                mockGuardian.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => mockGuardian
                });

                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [
                        { id: veteranId, name: veteranName }
                    ]
                };

                // Mock guardian PUT request (should be the only additional call)
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(res.json.called).to.be.true;
                // Should only have 2 fetch calls: GET guardian, PUT guardian
                // No veteran fetch calls should be made
                expect(global.fetch.callCount).to.equal(2);
            });
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

        it('should return 503 when database session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await deleteGuardian(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });
    });

    describe('updateGuardianSeat', () => {
        const mockGuardianDoc = {
            _id: 'guard-123',
            _rev: '1-abc',
            type: 'Guardian',
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

        it('should update guardian seat successfully', async () => {
            req.body = { value: '14B' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(mockGuardianDoc))
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-123', rev: '2-xyz' }) };
            });

            await updateGuardianSeat(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.ok).to.equal(true);
            expect(response.seat).to.equal('14B');
            expect(savedDoc.flight.seat).to.equal('14B');
            expect(savedDoc.flight.history.length).to.equal(1);
            expect(savedDoc.flight.history[0].change).to.include('changed seat from: 10A to: 14B');
        });

        it('should update guardian seat with empty old value', async () => {
            req.body = { value: '5C' };
            const docWithoutSeat = {
                _id: 'guard-123',
                _rev: '1-abc',
                type: 'Guardian',
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
                return { ok: true, json: async () => ({ id: 'guard-123', rev: '2-xyz' }) };
            });

            await updateGuardianSeat(req, res);

            expect(savedDoc.flight.history[0].change).to.include('changed seat from:  to: 5C');
        });

        it('should initialize flight and history if not present', async () => {
            req.body = { value: '7D' };
            const docWithoutFlight = { 
                _id: 'guard-123', 
                _rev: '1-abc', 
                type: 'Guardian' 
            };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => docWithoutFlight
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-123', rev: '2-xyz' }) };
            });

            await updateGuardianSeat(req, res);

            expect(savedDoc.flight).to.be.an('object');
            expect(savedDoc.flight.seat).to.equal('7D');
            expect(savedDoc.flight.history).to.be.an('array');
        });

        it('should return 400 when value is missing', async () => {
            req.body = {};

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('value is required');
        });

        it('should return 400 when value is null', async () => {
            req.body = { value: null };

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 404 when guardian not found', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Guardian not found');
        });

        it('should return 500 when fetch fails with non-404 error', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Database error' })
            });

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian for update');
        });

        it('should return 400 when document is not a guardian', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Veteran' })
            });

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a guardian record');
        });

        it('should return 500 when save fails', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockGuardianDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Conflict' })
            });

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Conflict');
        });

        it('should return 500 when save fails without reason', async () => {
            req.body = { value: '14A' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockGuardianDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: undefined })  // Explicitly undefined to hit || branch
            });

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to update guardian seat');
        });

        it('should return 503 when database session cannot be established', async () => {
            req.body = { value: '14A' };
            
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(503)).to.be.true;
        });
    });

    describe('updateGuardianBus', () => {
        const mockGuardianDoc = {
            _id: 'guard-123',
            _rev: '1-abc',
            type: 'Guardian',
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

        it('should update guardian bus successfully', async () => {
            req.body = { value: 'Bravo3' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockGuardianDoc
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-123', rev: '2-xyz' }) };
            });

            await updateGuardianBus(req, res);

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
                    json: async () => mockGuardianDoc
                });

                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guard-123', rev: '2-xyz' })
                });

                await updateGuardianBus(req, res);

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

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Invalid bus value');
            expect(res.json.firstCall.args[0].error).to.include('None, Alpha1');
        });

        it('should return 400 when value is missing', async () => {
            req.body = {};

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('value is required');
        });

        it('should initialize flight and history if not present', async () => {
            req.body = { value: 'Alpha2' };
            const docWithoutFlight = { 
                _id: 'guard-123', 
                _rev: '1-abc', 
                type: 'Guardian' 
            };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => docWithoutFlight
            });

            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-123', rev: '2-xyz' }) };
            });

            await updateGuardianBus(req, res);

            expect(savedDoc.flight).to.be.an('object');
            expect(savedDoc.flight.bus).to.equal('Alpha2');
            expect(savedDoc.flight.history).to.be.an('array');
            expect(savedDoc.flight.history[0].change).to.include('changed bus from: None to: Alpha2');
        });

        it('should return 404 when guardian not found', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should return 500 when fetch fails with non-404 error', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Database error' })
            });

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian for update');
        });

        it('should return 400 when document is not a guardian', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ _id: 'doc-1', type: 'Flight' })
            });

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
        });

        it('should return 500 when save fails', async () => {
            req.body = { value: 'Bravo1' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockGuardianDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Database error' })
            });

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should return 500 when save fails without reason', async () => {
            req.body = { value: 'Bravo1' };
            
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockGuardianDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: undefined })  // Explicitly undefined to hit || branch
            });

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to update guardian bus');
        });

        it('should return 503 when database session cannot be established', async () => {
            req.body = { value: 'Alpha1' };
            
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(503)).to.be.true;
        });
    });
}); 