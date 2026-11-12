import { expect } from 'chai';
import sinon from 'sinon';
import {
    createGuardian,
    retrieveGuardian,
    updateGuardian,
    deleteGuardian,
    updateGuardianSeat,
    updateGuardianBus,
    updateGuardianTrainingNotes,
    updateGuardianTrainingComplete,
    updateGuardianWaiver,
    updateGuardianTrainingSeeDoc,
    updateGuardianVaccinated,
    updateGuardianMedicalForm,
    updateGuardianPaid,
    updateGuardianBooksOrdered,
    updateGuardianApparelShirtSize,
    updateGuardianApparelJacketSize,
    updateGuardianApparelNotes
} from '../routes/guardians.js';
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
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian');
            expect(res.json.firstCall.args[0].error).to.not.include('Database error');
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
            expect(res.json.firstCall.args[0].error).to.include('Failed to update guardian');
            expect(res.json.firstCall.args[0].error).to.not.include('Update failed');
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

        it('should return 400 for an invalid document id before reading CouchDB', async () => {
            req.params.id = 'foo/bar';

            await updateGuardian(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid document id');
            expect(global.fetch.called).to.be.false;
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

            it('should record a pairing error when the veteran id is not a valid document id', async () => {
                sinon.stub(console, 'warn');
                sinon.stub(console, 'error');
                req.body = JSON.parse(JSON.stringify(baseSampleData));
                req.body.veteran = {
                    pref_notes: '',
                    history: [],
                    pairings: [{ id: 'foo/bar', name: 'Bad Id' }]
                };
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    json: async () => ({ id: 'guardian-id', rev: '2-def' })
                });

                await updateGuardian(req, res);

                expect(global.fetch.callCount).to.equal(2);
                expect(res.json.called).to.be.true;
                expect(console.error.calledOnce).to.be.true;
                expect(console.error.firstCall.args[1][0]).to.include('Invalid document id');
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
            expect(res.json.firstCall.args[0].error).to.include('Failed to delete guardian');
            expect(res.json.firstCall.args[0].error).to.not.include('Delete failed');
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

        it('should return 400 for an invalid document id before reading CouchDB', async () => {
            req.params.id = 'foo/bar';

            await deleteGuardian(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid document id');
            expect(global.fetch.called).to.be.false;
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
            expect(res.json.firstCall.args[0].error).to.include('Failed to update guardian seat');
            expect(res.json.firstCall.args[0].error).to.not.include('Conflict');
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

        it('should return 400 for an invalid document id before reading CouchDB', async () => {
            req.params.id = 'foo/bar';
            req.body = { value: '14B' };

            await updateGuardianSeat(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid document id');
            expect(global.fetch.called).to.be.false;
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

        it('should return 400 for an invalid document id before reading CouchDB', async () => {
            req.params.id = 'foo/bar';
            req.body = { value: 'Alpha1' };

            await updateGuardianBus(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid document id');
            expect(global.fetch.called).to.be.false;
        });
    });

    describe('extended guardian patch handlers', () => {
        it('should return 400 for an invalid document id before reading CouchDB', async () => {
            req.params.id = 'foo/bar';
            req.body = { value: 'updated notes' };

            await updateGuardianTrainingNotes(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid document id');
            expect(global.fetch.called).to.be.false;
        });

        const baseDoc = {
            _id: 'guard-extended-1',
            _rev: '1-abc',
            type: 'Guardian',
            flight: {
                training_notes: 'old training notes',
                training_complete: false,
                waiver: false,
                training_see_doc: false,
                vaccinated: false,
                paid: false,
                booksOrdered: 0,
                history: []
            },
            medical: { form: false },
            apparel: { shirt_size: 'M', jacket_size: 'L', notes: 'old notes' },
            call: { history: [] },
            metadata: {}
        };

        const cases = [
            {
                name: 'training-notes',
                handler: updateGuardianTrainingNotes,
                valid: 'updated training notes',
                invalid: 42,
                expectedField: 'training_notes',
                docGetter: (doc) => doc.flight.training_notes
            },
            {
                name: 'training-complete',
                handler: updateGuardianTrainingComplete,
                valid: true,
                invalid: 'bad',
                expectedField: 'training_complete',
                docGetter: (doc) => doc.flight.training_complete
            },
            {
                name: 'waiver',
                handler: updateGuardianWaiver,
                valid: true,
                invalid: 'bad',
                expectedField: 'waiver',
                docGetter: (doc) => doc.flight.waiver
            },
            {
                name: 'training-see-doc',
                handler: updateGuardianTrainingSeeDoc,
                valid: true,
                invalid: 'bad',
                expectedField: 'training_see_doc',
                docGetter: (doc) => doc.flight.training_see_doc
            },
            {
                name: 'vaccinated',
                handler: updateGuardianVaccinated,
                valid: true,
                invalid: 'bad',
                expectedField: 'vaccinated',
                docGetter: (doc) => doc.flight.vaccinated
            },
            {
                name: 'medical-form',
                handler: updateGuardianMedicalForm,
                valid: true,
                invalid: 'bad',
                expectedField: 'medical_form',
                docGetter: (doc) => doc.medical.form
            },
            {
                name: 'paid',
                handler: updateGuardianPaid,
                valid: true,
                invalid: 'bad',
                expectedField: 'paid',
                docGetter: (doc) => doc.flight.paid
            },
            {
                name: 'books-ordered',
                handler: updateGuardianBooksOrdered,
                valid: 3,
                invalid: 10,
                expectedField: 'books_ordered',
                docGetter: (doc) => doc.flight.booksOrdered
            },
            {
                name: 'apparel-shirt-size',
                handler: updateGuardianApparelShirtSize,
                valid: 'WM',
                invalid: 'BAD',
                expectedField: 'apparel_shirt_size',
                docGetter: (doc) => doc.apparel.shirt_size
            },
            {
                name: 'apparel-jacket-size',
                handler: updateGuardianApparelJacketSize,
                valid: 'XL',
                invalid: 'BAD',
                expectedField: 'apparel_jacket_size',
                docGetter: (doc) => doc.apparel.jacket_size
            },
            {
                name: 'apparel-notes',
                handler: updateGuardianApparelNotes,
                valid: 'new apparel note',
                invalid: 42,
                expectedField: 'apparel_notes',
                docGetter: (doc) => doc.apparel.notes
            }
        ];

        for (const testCase of cases) {
            it(`should update ${testCase.name} successfully`, async () => {
                req.body = { value: testCase.valid };
                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => JSON.parse(JSON.stringify(baseDoc))
                });
                let savedDoc = null;
                global.fetch.onSecondCall().callsFake(async (url, options) => {
                    savedDoc = JSON.parse(options.body);
                    return { ok: true, json: async () => ({ id: baseDoc._id, rev: '2-new' }) };
                });

                await testCase.handler(req, res);

                expect(res.json.called).to.be.true;
                const response = res.json.firstCall.args[0];
                expect(response.ok).to.equal(true);
                expect(response[testCase.expectedField]).to.deep.equal(testCase.valid);
                expect(testCase.docGetter(savedDoc)).to.deep.equal(testCase.valid);
                expect(savedDoc.metadata.updated_at).to.be.a('string');
                expect(savedDoc.metadata.updated_by).to.equal('Admin User');
                expect(savedDoc.flight.history.length).to.equal(1);
                expect(savedDoc.flight.history[0].change).to.include('changed');
            });

            it(`should return 400 for invalid value on ${testCase.name}`, async () => {
                req.body = { value: testCase.invalid };
                await testCase.handler(req, res);
                expect(res.status.calledWith(400)).to.be.true;
            });

            it(`should return 400 when value missing on ${testCase.name}`, async () => {
                req.body = {};
                await testCase.handler(req, res);
                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.include('value is required');
            });

            it(`should return 404 when guardian missing on ${testCase.name}`, async () => {
                req.body = { value: testCase.valid };
                global.fetch.onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                });
                await testCase.handler(req, res);
                expect(res.status.calledWith(404)).to.be.true;
            });

            it(`should return 400 for wrong document type on ${testCase.name}`, async () => {
                req.body = { value: testCase.valid };
                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => ({ _id: 'doc-x', type: 'Veteran' })
                });
                await testCase.handler(req, res);
                expect(res.status.calledWith(400)).to.be.true;
            });

            it(`should return 500 when save fails on ${testCase.name}`, async () => {
                req.body = { value: testCase.valid };
                global.fetch.onFirstCall().resolves({
                    ok: true,
                    json: async () => JSON.parse(JSON.stringify(baseDoc))
                });
                global.fetch.onSecondCall().resolves({
                    ok: false,
                    json: async () => ({ reason: 'Conflict' })
                });
                await testCase.handler(req, res);
                expect(res.status.calledWith(500)).to.be.true;
            });

            it(`should return 503 when session fails on ${testCase.name}`, async () => {
                req.body = { value: testCase.valid };
                global.fetch.resolves({
                    ok: false,
                    status: 401
                });
                await testCase.handler(req, res);
                expect(res.status.calledWith(503)).to.be.true;
            });
        }

        it('should trim padded apparel shirt size before validation', async () => {
            req.body = { value: '  WM  ' };
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(baseDoc))
            });
            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: baseDoc._id, rev: '2-new' }) };
            });

            await updateGuardianApparelShirtSize(req, res);

            expect(res.json.firstCall.args[0].apparel_shirt_size).to.equal('WM');
            expect(savedDoc.apparel.shirt_size).to.equal('WM');
        });

        it('should return 500 for non-404 fetch failure in helper', async () => {
            req.body = { value: true };
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ error: 'db_error' })
            });

            await updateGuardianWaiver(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get guardian for update');
        });

        it('should initialize missing flight history and metadata object', async () => {
            req.body = { value: true };
            const docWithoutHistoryOrMetadata = {
                _id: 'guard-init-1',
                _rev: '1-a',
                type: 'Guardian',
                flight: {},
                medical: {},
                apparel: {}
            };
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(docWithoutHistoryOrMetadata))
            });
            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-init-1', rev: '2-b' }) };
            });

            await updateGuardianTrainingComplete(req, res);

            expect(savedDoc.flight.history).to.be.an('array');
            expect(savedDoc.flight.history.length).to.equal(1);
            expect(savedDoc.metadata).to.be.an('object');
            expect(savedDoc.metadata.updated_by).to.equal('Admin User');
        });

        it('should create missing nested objects when setting values', async () => {
            req.body = { value: true };
            const docWithoutNestedParents = {
                _id: 'guard-nested-1',
                _rev: '1-a',
                type: 'Guardian'
            };
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(docWithoutNestedParents))
            });
            let savedDoc = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                savedDoc = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-nested-1', rev: '2-b' }) };
            });

            await updateGuardianPaid(req, res);

            expect(savedDoc.flight).to.be.an('object');
            expect(savedDoc.flight.paid).to.equal(true);
            expect(savedDoc.flight.history).to.be.an('array');
        });

        it('should use configured save error message when save fails without reason', async () => {
            req.body = { value: true };
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(baseDoc))
            });
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({})
            });

            await updateGuardianWaiver(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to update guardian waiver');
        });
    });

    describe('crew', () => {
        const CREW_POSITIONS = [
            '',
            'Bus Captain',
            'Tour Lead',
            'Medical Team',
            'PR',
            'Fly Ahead',
            'Photographer'
        ];
        const INVALID_CREW_POSITION = 'Invalid crew position';
        const CREW_USERNAME_REQUIRED = 'Comms username is required when a crew position is set';
        const storedCrew = { crew_position: 'Medical Team', comms_username: 'Medic1' };

        function validGuardian(overrides = {}) {
            return {
                ...JSON.parse(JSON.stringify(baseSampleData)),
                ...overrides
            };
        }

        function storedGuardian(overrides = {}) {
            return {
                ...validGuardian(),
                _id: 'test-id',
                _rev: '1-abc',
                type: 'Guardian',
                flight: {
                    id: 'None',
                    status: 'Active',
                    history: [{ id: '2023-01-01T12:00:00Z', change: 'Original flight assignment' }]
                },
                ...overrides
            };
        }

        function crewChanges(history) {
            const entries = Array.isArray(history) ? history : [];
            return entries
                .map((entry) => entry.change)
                .filter((change) => change.includes('crew position') || change.includes('comms username'));
        }

        function crewChange(label, fromValue, toValue) {
            return `changed ${label} from: ${fromValue} to: ${toValue} by: Admin User`;
        }

        function putBody() {
            const call = global.fetch.getCalls().find((item) => item.args[1]?.method === 'PUT');
            expect(call, 'expected a guardian PUT').to.exist;
            return JSON.parse(call.args[1].body);
        }

        function mockGuardianUpdate(stored) {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(stored))
            });
            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ id: stored._id, rev: '2-def' })
            });
        }

        it('accepts every crew position and returns it from POST /guardians', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });

            for (const crewPosition of CREW_POSITIONS) {
                const response = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                global.fetch.resetHistory();
                req.body = validGuardian({
                    crew: { crew_position: crewPosition, comms_username: 'RadioOne' }
                });

                await createGuardian(req, response);

                expect(response.status.calledWith(201), crewPosition).to.equal(true);
                const body = response.json.firstCall.args[0];
                expect(body.crew, crewPosition).to.deep.equal({
                    crew_position: crewPosition,
                    comms_username: 'RadioOne'
                });
                const written = JSON.parse(global.fetch.firstCall.args[1].body);
                expect(written.crew, crewPosition).to.deep.equal({
                    crew_position: crewPosition,
                    comms_username: 'RadioOne'
                });
            }
        });

        it('round-trips a trimmed comms username and preserves its case', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });
            req.body = validGuardian({
                crew: { crew_position: 'PR', comms_username: '  Radio.One  ' }
            });

            await createGuardian(req, res);

            expect(res.status.calledWith(201), JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(true);
            expect(res.json.firstCall.args[0].crew).to.deep.equal({
                crew_position: 'PR',
                comms_username: 'Radio.One'
            });
            expect(res.json.firstCall.args[0]._id).to.equal('new-id');
        });

        it('rejects an invalid crew position before writing', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });

            for (const crewPosition of ['Captain', 'BusCaptain', 'medical team', 'FlyAhead']) {
                const response = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                global.fetch.resetHistory();
                req.body = validGuardian({
                    crew: { crew_position: crewPosition, comms_username: 'RadioOne' }
                });

                await createGuardian(req, response);

                const detail = `${crewPosition} ${JSON.stringify(response.json.firstCall?.args?.[0])}`;
                expect(response.status.firstCall?.args?.[0], detail).to.equal(400);
                expect(response.json.firstCall.args[0].error, detail).to.include(INVALID_CREW_POSITION);
                expect(global.fetch.called, detail).to.equal(false);
            }
        });

        it('returns 400 when a crew position has no comms username', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });
            req.body = validGuardian({ crew: { crew_position: 'Bus Captain' } });

            await createGuardian(req, res);

            const detail = JSON.stringify(res.json.firstCall?.args?.[0]);
            expect(res.status.firstCall?.args?.[0], detail).to.equal(400);
            expect(res.json.firstCall.args[0].error).to.include(CREW_USERNAME_REQUIRED);
            expect(global.fetch.called).to.equal(false);
        });

        it('returns 400 when the comms username is blank after trim', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });
            req.body = validGuardian({
                crew: { crew_position: 'Tour Lead', comms_username: '   ' }
            });

            await createGuardian(req, res);

            const detail = JSON.stringify(res.json.firstCall?.args?.[0]);
            expect(res.status.firstCall?.args?.[0], detail).to.equal(400);
            expect(res.json.firstCall.args[0].error).to.include(CREW_USERNAME_REQUIRED);
            expect(global.fetch.called).to.equal(false);
        });

        it('allows a comms username without a crew position', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });
            req.body = validGuardian({ crew: { comms_username: 'RadioOne' } });

            await createGuardian(req, res);

            expect(res.status.calledWith(201), JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(true);
            expect(res.json.firstCall.args[0].crew).to.deep.equal({
                crew_position: '',
                comms_username: 'RadioOne'
            });
        });

        it('returns stored crew from GET /guardians/:id', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => storedGuardian({ crew: storedCrew })
            });

            await retrieveGuardian(req, res);

            expect(res.json.firstCall.args[0].crew).to.deep.equal(storedCrew);
        });

        it('defaults missing crew to empty strings on GET /guardians/:id', async () => {
            const stored = storedGuardian();
            delete stored.crew;
            global.fetch.resolves({
                ok: true,
                json: async () => stored
            });

            await retrieveGuardian(req, res);

            expect(res.json.firstCall.args[0].crew).to.deep.equal({
                crew_position: '',
                comms_username: ''
            });
        });

        it('keeps stored crew when PUT /guardians/:id omits the crew key', async () => {
            mockGuardianUpdate(storedGuardian({ crew: { ...storedCrew } }));
            req.body = validGuardian();

            await updateGuardian(req, res);

            expect(res.status.called, JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(false);
            const written = putBody();
            expect(written.crew).to.deep.equal(storedCrew);
            expect(res.json.firstCall.args[0].crew).to.deep.equal(storedCrew);
            expect(crewChanges(written.flight.history)).to.deep.equal([]);
            expect(written.flight.history.some((entry) => entry.change === 'Original flight assignment')).to.equal(true);
        });

        it('replaces crew as a whole when PUT /guardians/:id includes crew', async () => {
            mockGuardianUpdate(storedGuardian({ crew: { ...storedCrew } }));
            req.body = validGuardian({ crew: { comms_username: '  OnlyName  ' } });

            await updateGuardian(req, res);

            expect(res.status.called, JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(false);
            const written = putBody();
            expect(written.crew).to.deep.equal({ crew_position: '', comms_username: 'OnlyName' });
            expect(crewChanges(written.flight.history)).to.have.members([
                crewChange('crew position', 'Medical Team', ''),
                crewChange('comms username', 'Medic1', 'OnlyName')
            ]);
            expect(written.flight.history.some((entry) => entry.change === 'Original flight assignment')).to.equal(true);
        });

        it('returns 400 when PUT sets a crew position without a comms username', async () => {
            mockGuardianUpdate(storedGuardian({ crew: { ...storedCrew } }));
            req.body = validGuardian({ crew: { crew_position: 'PR' } });

            await updateGuardian(req, res);

            const detail = JSON.stringify(res.json.firstCall?.args?.[0]);
            expect(res.status.firstCall?.args?.[0], detail).to.equal(400);
            expect(res.json.firstCall.args[0].error).to.include(CREW_USERNAME_REQUIRED);
            expect(global.fetch.calledOnce).to.equal(true);
        });

        it('writes empty crew and no crew history when an old document is saved without crew', async () => {
            const stored = storedGuardian();
            delete stored.crew;
            mockGuardianUpdate(stored);
            req.body = validGuardian();

            await updateGuardian(req, res);

            expect(res.status.called, JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(false);
            const written = putBody();
            expect(written.crew).to.deep.equal({ crew_position: '', comms_username: '' });
            expect(res.json.firstCall.args[0].crew).to.deep.equal({
                crew_position: '',
                comms_username: ''
            });
            expect(crewChanges(written.flight.history)).to.deep.equal([]);
        });

        it('keeps the comms username on a copied guardian payload', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'copied-id', rev: '1-abc' })
            });
            req.body = {
                ...validGuardian(),
                birth_date: '1965-05-15',
                gender: 'F',
                app_date: '2026-11-12',
                flight: {
                    id: 'None',
                    status: 'Copied',
                    group: '',
                    bus: 'None',
                    seat: '',
                    confirmed_date: '',
                    confirmed_by: '',
                    status_note: '',
                    nofly: false,
                    vaccinated: false,
                    mediaWaiver: false,
                    infection_test: false,
                    waiver: false,
                    training: 'None',
                    training_notes: '',
                    training_see_doc: false,
                    training_complete: false,
                    paid: false,
                    exempt: false,
                    booksOrdered: 0,
                    history: [{
                        id: '2026-11-12T02:00:00Z',
                        change: 'copied guardian from doc id: source-id rev: 3-abc by: Admin User'
                    }]
                },
                call: {
                    assigned_to: '',
                    notes: '',
                    fm_number: '',
                    email_sent: false,
                    mail_sent: false,
                    how_heard_about: 'Unknown'
                },
                veteran: { pref_notes: '', pairings: [] },
                medical: { release: false, limitations: '', food_restriction: 'None' },
                apparel: {
                    item: 'None',
                    jacket_size: 'None',
                    shirt_size: 'None',
                    delivery: 'None',
                    date: '',
                    by: '',
                    notes: ''
                },
                crew: { crew_position: '', comms_username: 'BusCap1' }
            };

            await createGuardian(req, res);

            expect(res.status.calledWith(201), JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(true);
            expect(res.json.firstCall.args[0].flight.status).to.equal('Copied');
            expect(res.json.firstCall.args[0].crew).to.deep.equal({
                crew_position: '',
                comms_username: 'BusCap1'
            });
            const written = JSON.parse(global.fetch.firstCall.args[1].body);
            expect(written.crew).to.deep.equal({
                crew_position: '',
                comms_username: 'BusCap1'
            });
        });

        async function expectPatchKeepsCrew(handler, body) {
            const doc = {
                _id: 'guard-123',
                _rev: '1-abc',
                type: 'Guardian',
                crew: { ...storedCrew },
                flight: {
                    id: 'SSHF-Nov2024',
                    bus: 'Alpha1',
                    seat: '10A',
                    training_notes: 'old notes',
                    history: []
                },
                metadata: {}
            };
            req.params.id = 'guard-123';
            req.body = body;
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => JSON.parse(JSON.stringify(doc))
            });
            let saved = null;
            global.fetch.onSecondCall().callsFake(async (url, options) => {
                saved = JSON.parse(options.body);
                return { ok: true, json: async () => ({ id: 'guard-123', rev: '2-xyz' }) };
            });

            await handler(req, res);

            expect(res.json.firstCall.args[0].ok, JSON.stringify(res.json.firstCall?.args?.[0])).to.equal(true);
            expect(saved.crew).to.deep.equal(storedCrew);
        }

        it('keeps an existing crew object when the seat is patched', async () => {
            await expectPatchKeepsCrew(updateGuardianSeat, { value: '14B' });
            expect(putBody().flight.seat).to.equal('14B');
        });

        it('keeps an existing crew object when the bus is patched', async () => {
            await expectPatchKeepsCrew(updateGuardianBus, { value: 'Bravo1' });
            expect(putBody().flight.bus).to.equal('Bravo1');
        });

        it('keeps an existing crew object when a guardian field is patched', async () => {
            await expectPatchKeepsCrew(updateGuardianTrainingNotes, { value: 'updated training notes' });
            expect(putBody().flight.training_notes).to.equal('updated training notes');
        });
    });
}); 