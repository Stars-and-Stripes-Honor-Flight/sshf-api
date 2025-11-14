import { expect } from 'chai';
import sinon from 'sinon';
import { listFlights, createFlight, retrieveFlight, updateFlight } from '../routes/flights.js';

describe('Flights Route Handlers', () => {
    let req, res;
    const baseSampleData = {
        type: 'Flight',
        name: 'SSHF-Nov2011',
        flight_date: '2011-11-05',
        capacity: 448,
        completed: true
    };

    beforeEach(() => {
        // Deep clone the sample data for each test
        const sampleFlightData = JSON.parse(JSON.stringify(baseSampleData));
        
        req = {
            params: { id: 'test-id' },
            body: sampleFlightData,
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

    describe('listFlights', () => {
        it('should return a list of flights', async () => {
            const mockViewResult = {
                total_rows: 2,
                offset: 0,
                rows: [
                    {
                        id: 'flight1',
                        key: 'SSHF-Nov2011',
                        value: null,
                        doc: {
                            _id: 'flight1',
                            _rev: '1-abc',
                            type: 'Flight',
                            name: 'SSHF-Nov2011',
                            flight_date: '2011-11-05',
                            capacity: 448,
                            completed: true
                        }
                    },
                    {
                        id: 'flight2',
                        key: 'SSHF-Dec2011',
                        value: null,
                        doc: {
                            _id: 'flight2',
                            _rev: '1-def',
                            type: 'Flight',
                            name: 'SSHF-Dec2011',
                            flight_date: '2011-12-05',
                            capacity: 500,
                            completed: false
                        }
                    }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response.length).to.equal(2);
            expect(response[0]).to.have.property('_id');
            expect(response[0]).to.have.property('name');
            expect(response[0]).to.have.property('flight_date');
            expect(response[0]).to.have.property('capacity');
            expect(response[0]).to.have.property('completed');
            expect(response[0]._id).to.equal('flight1');
            expect(response[0].name).to.equal('SSHF-Nov2011');
            expect(response[0].capacity).to.equal(448);
        });

        it('should handle empty results', async () => {
            const mockViewResult = {
                total_rows: 0,
                offset: 0,
                rows: []
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response.length).to.equal(0);
        });

        it('should handle view results with value instead of doc', async () => {
            const mockViewResult = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'flight1',
                        key: 'SSHF-Nov2011',
                        value: {
                            name: 'SSHF-Nov2011',
                            flight_date: '2011-11-05',
                            capacity: 448,
                            completed: true
                        },
                        doc: null
                    }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response.length).to.equal(1);
            expect(response[0]).to.have.property('_id');
            expect(response[0]._id).to.equal('flight1'); // Should use row.id as fallback
            expect(response[0].name).to.equal('SSHF-Nov2011');
        });

        it('should handle view results with empty doc and value (fallback to empty object)', async () => {
            const mockViewResult = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'flight1',
                        key: 'SSHF-Nov2011',
                        value: null,
                        doc: null
                    }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response).to.be.an('array');
            expect(response.length).to.equal(1);
            expect(response[0]._id).to.equal('flight1'); // Should use row.id
            expect(response[0].name).to.equal(''); // Should default to empty string
            expect(response[0].flight_date).to.equal(''); // Should default to empty string
            expect(response[0].capacity).to.equal(0); // Should default to 0
            expect(response[0].completed).to.equal(false); // Should default to false
        });

        it('should handle view results with doc missing _id (use row.id)', async () => {
            const mockViewResult = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'flight1',
                        key: 'SSHF-Nov2011',
                        doc: {
                            // Missing _id field
                            name: 'SSHF-Nov2011',
                            flight_date: '2011-11-05',
                            capacity: 448,
                            completed: true
                        }
                    }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response[0]._id).to.equal('flight1'); // Should use row.id
            expect(response[0].name).to.equal('SSHF-Nov2011');
        });

        it('should handle view results with missing _id in both doc and row.id (empty string fallback)', async () => {
            const mockViewResult = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: '', // Empty id
                        key: 'SSHF-Nov2011',
                        doc: {
                            // Missing _id field
                            name: 'SSHF-Nov2011',
                            flight_date: '2011-11-05',
                            capacity: 448,
                            completed: true
                        }
                    }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response[0]._id).to.equal(''); // Should default to empty string
            expect(response[0].name).to.equal('SSHF-Nov2011');
        });

        it('should handle view results with missing properties in doc (use defaults)', async () => {
            const mockViewResult = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'flight1',
                        key: 'SSHF-Nov2011',
                        doc: {
                            _id: 'flight1',
                            // Missing name, flight_date, capacity, completed
                            type: 'Flight'
                        }
                    }
                ]
            };

            global.fetch.resolves({
                ok: true,
                json: async () => mockViewResult
            });

            await listFlights(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response[0]._id).to.equal('flight1');
            expect(response[0].name).to.equal(''); // Should default to empty string
            expect(response[0].flight_date).to.equal(''); // Should default to empty string
            expect(response[0].capacity).to.equal(0); // Should default to 0
            expect(response[0].completed).to.equal(false); // Should default to false
        });

        it('should handle database errors', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({ reason: 'Database error' })
            });

            await listFlights(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database error');
        });

        it('should handle database errors without reason', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({})
            });

            await listFlights(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to retrieve flights');
        });
    });

    describe('createFlight', () => {
        it('should create a new flight record', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });

            await createFlight(req, res);

            expect(res.status.calledWith(201)).to.be.true;
            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._id).to.equal('new-id');
            expect(response.type).to.equal('Flight');
        });

        it('should set completed to false by default for new flights', async () => {
            // Remove completed from request body
            req.body = {
                type: 'Flight',
                name: 'SSHF-Nov2011',
                flight_date: '2011-11-05',
                capacity: 448
            };

            global.fetch.resolves({
                ok: true,
                json: async () => ({ id: 'new-id', rev: '1-abc' })
            });

            await createFlight(req, res);

            expect(res.status.calledWith(201)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.completed).to.equal(false);
        });

        it('should handle validation errors - missing name', async () => {
            req.body = {
                type: 'Flight',
                flight_date: '2011-11-05',
                capacity: 448
            };

            await createFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
            expect(res.json.firstCall.args[0].error).to.include('Name is required');
        });

        it('should handle validation errors - invalid flight_date format', async () => {
            req.body = {
                type: 'Flight',
                name: 'SSHF-Nov2011',
                flight_date: '11-05-2011', // Wrong format
                capacity: 448
            };

            await createFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
            expect(res.json.firstCall.args[0].error).to.include('Flight date must be in YYYY-MM-DD format');
        });

        it('should handle validation errors - invalid capacity', async () => {
            req.body = {
                type: 'Flight',
                name: 'SSHF-Nov2011',
                flight_date: '2011-11-05',
                capacity: -10 // Invalid: negative
            };

            await createFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
            expect(res.json.firstCall.args[0].error).to.include('Capacity must be a positive integer');
        });

        it('should handle validation errors - non-integer capacity', async () => {
            req.body = {
                type: 'Flight',
                name: 'SSHF-Nov2011',
                flight_date: '2011-11-05',
                capacity: 448.5 // Invalid: not an integer
            };

            await createFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
            expect(res.json.firstCall.args[0].error).to.include('Capacity must be a positive integer');
        });

        it('should handle validation errors - wrong type', async () => {
            req.body = {
                type: 'Veteran', // Wrong type
                name: 'SSHF-Nov2011',
                flight_date: '2011-11-05',
                capacity: 448
            };

            await createFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
            expect(res.json.firstCall.args[0].error).to.include('Document type must be Flight');
        });

        it('should handle database errors', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({ reason: 'Database error' })
            });

            await createFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should handle database errors without reason', async () => {
            global.fetch.resolves({
                ok: false,
                json: async () => ({})
            });

            await createFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to create flight document');
        });
    });

    describe('retrieveFlight', () => {
        it('should retrieve an existing flight', async () => {
            const mockFlight = JSON.parse(JSON.stringify(baseSampleData));
            mockFlight._id = 'test-id';
            mockFlight._rev = '1-abc';
            mockFlight.type = 'Flight';

            global.fetch.resolves({
                ok: true,
                json: async () => mockFlight
            });

            await retrieveFlight(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.name).to.equal('SSHF-Nov2011');
            expect(response.type).to.equal('Flight');
        });

        it('should handle non-flight documents', async () => {
            global.fetch.resolves({
                ok: true,
                json: async () => ({ _id: 'test-id', type: 'Veteran' })
            });

            await retrieveFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a flight record');
        });

        it('should handle not found errors', async () => {
            global.fetch.resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await retrieveFlight(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle database errors during retrieval', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await retrieveFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database error');
        });

        it('should handle database errors without reason during retrieval', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await retrieveFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get flight');
        });
    });

    describe('updateFlight', () => {
        beforeEach(() => {
            const mockFlight = JSON.parse(JSON.stringify(baseSampleData));
            mockFlight._id = 'test-id';
            mockFlight._rev = '1-abc';
            mockFlight.type = 'Flight';

            // Mock the initial GET request
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => mockFlight
            });
        });

        it('should update an existing flight', async () => {
            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ id: 'test-id', rev: '2-def' })
            });

            await updateFlight(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._rev).to.equal('2-def');
        });

        it('should handle validation errors', async () => {
            req.body.name = ''; // Invalid: empty name

            await updateFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
        });

        it('should handle not found errors', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateFlight(req, res);

            expect(res.status.calledWith(404)).to.be.true;
        });

        it('should handle non-flight documents during update', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => ({ 
                    _id: 'test-id',
                    type: 'Veteran'
                })
            });

            await updateFlight(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('not a flight record');
        });

        it('should preserve metadata.created_at and metadata.created_by', async () => {
            // Mock current document with server-controlled fields
            const currentDoc = {
                _id: 'test-id',
                _rev: '1-abc',
                type: 'Flight',
                name: 'SSHF-Nov2011',
                flight_date: '2011-11-05',
                capacity: 448,
                completed: true,
                metadata: {
                    created_at: '2023-01-01T12:00:00Z',
                    created_by: 'Original User',
                    updated_at: '2023-01-01T12:00:00Z',
                    updated_by: 'Original User'
                }
            };

            // Client tries to overwrite server-controlled fields
            req.body = {
                type: 'Veteran', // Try to change type
                metadata: {
                    created_at: '2024-01-01T12:00:00Z', // Try to change creation metadata
                    created_by: 'Hacker User'
                },
                name: 'SSHF-Dec2011', // Valid change
                flight_date: '2011-12-05',
                capacity: 500,
                completed: false
            };

            global.fetch.onFirstCall().resolves({
                ok: true,
                json: async () => currentDoc
            });

            global.fetch.onSecondCall().resolves({
                ok: true,
                json: async () => ({ id: 'test-id', rev: '2-def' })
            });

            await updateFlight(req, res);

            expect(res.json.called).to.be.true;
            const response = res.json.firstCall.args[0];
            
            // Verify server-controlled fields are preserved
            expect(response.type).to.equal('Flight'); // Should remain "Flight"
            expect(response.metadata.created_at).to.equal('2023-01-01T12:00:00Z'); // Should be preserved
            expect(response.metadata.created_by).to.equal('Original User'); // Should be preserved
            
            // Verify client changes are applied to non-server-controlled fields
            expect(response.name).to.equal('SSHF-Dec2011');
            expect(response.capacity).to.equal(500);
            
            // Verify updated_at and updated_by are set by prepareForSave
            expect(response.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(response.metadata.updated_by).to.equal('Admin User');
        });

        it('should handle database update errors', async () => {
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: 'Update failed' })
            });

            await updateFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Update failed');
        });

        it('should handle database update errors when no reason is provided', async () => {
            global.fetch.onSecondCall().resolves({
                ok: false,
                json: async () => ({ reason: '' })
            });

            await updateFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to update flight');
        });

        it('should handle database errors during initial get', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'Database error' })
            });

            await updateFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get flight for update');
        });

        it('should handle database errors without reason during initial get', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await updateFlight(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Failed to get flight for update');
        });
    });
});

