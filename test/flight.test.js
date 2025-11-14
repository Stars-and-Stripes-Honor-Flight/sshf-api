import { expect } from 'chai';
import { Flight } from '../models/flight.js';

describe('Flight Model', () => {
    let baseSampleData;

    beforeEach(() => {
        baseSampleData = {
            type: 'Flight',
            name: 'SSHF-Nov2011',
            flight_date: '2011-11-05',
            capacity: 448,
            completed: true
        };
    });

    describe('constructor', () => {
        it('should create a valid flight instance with provided data', () => {
            const flight = new Flight(baseSampleData);
            expect(flight.type).to.equal('Flight');
            expect(flight.name).to.equal('SSHF-Nov2011');
            expect(flight.flight_date).to.equal('2011-11-05');
            expect(flight.capacity).to.equal(448);
            expect(flight.completed).to.equal(true);
        });

        it('should create a flight instance with default values when no data provided', () => {
            const flight = new Flight();
            expect(flight._id).to.equal('');
            expect(flight._rev).to.equal('');
            expect(flight.type).to.equal('Flight');
            expect(flight.name).to.equal('');
            expect(flight.flight_date).to.equal('');
            expect(flight.capacity).to.equal(0);
            expect(flight.completed).to.equal(false);
        });

        it('should initialize metadata fields with default values', () => {
            const flight = new Flight();
            expect(flight.metadata.created_at).to.equal('');
            expect(flight.metadata.created_by).to.equal('');
            expect(flight.metadata.updated_at).to.equal('');
            expect(flight.metadata.updated_by).to.equal('');
        });

        it('should initialize metadata fields with provided values', () => {
            const data = {
                ...baseSampleData,
                metadata: {
                    created_at: '2023-01-01T12:00:00Z',
                    created_by: 'Test User',
                    updated_at: '2023-01-02T12:00:00Z',
                    updated_by: 'Test User 2'
                }
            };
            const flight = new Flight(data);
            expect(flight.metadata.created_at).to.equal('2023-01-01T12:00:00Z');
            expect(flight.metadata.created_by).to.equal('Test User');
        });
    });

    describe('validate', () => {
        it('should validate a properly formed flight', () => {
            const flight = new Flight(baseSampleData);
            expect(() => flight.validate()).to.not.throw();
        });

        it('should reject invalid type', () => {
            const flight = new Flight({ ...baseSampleData, type: 'Veteran' });
            expect(() => flight.validate()).to.throw('Document type must be Flight');
        });

        it('should reject missing name', () => {
            const flight = new Flight({ ...baseSampleData, name: '' });
            expect(() => flight.validate()).to.throw('Name is required');
        });

        it('should reject non-string name', () => {
            const flight = new Flight({ ...baseSampleData, name: 123 });
            expect(() => flight.validate()).to.throw('Name is required');
        });

        it('should reject name with only whitespace', () => {
            const flight = new Flight({ ...baseSampleData, name: '   ' });
            expect(() => flight.validate()).to.throw('Name is required');
        });

        it('should reject missing flight_date (empty string)', () => {
            const flight = new Flight({ ...baseSampleData, flight_date: '' });
            expect(() => flight.validate()).to.throw('Flight date is required');
        });

        it('should reject missing flight_date (undefined)', () => {
            const flight = new Flight({ ...baseSampleData, flight_date: undefined });
            expect(() => flight.validate()).to.throw('Flight date is required');
        });

        it('should reject invalid flight_date format', () => {
            const flight = new Flight({ ...baseSampleData, flight_date: '11-05-2011' });
            expect(() => flight.validate()).to.throw('Flight date must be in YYYY-MM-DD format');
        });

        it('should reject missing capacity (null)', () => {
            const flight = new Flight({ ...baseSampleData, capacity: null });
            expect(() => flight.validate()).to.throw('Capacity is required');
        });

        it('should reject missing capacity (undefined)', () => {
            const flight = new Flight(baseSampleData);
            // Directly set to undefined to test that branch (constructor sets default to 0)
            flight.capacity = undefined;
            expect(() => flight.validate()).to.throw('Capacity is required');
        });

        it('should reject negative capacity', () => {
            const flight = new Flight({ ...baseSampleData, capacity: -10 });
            expect(() => flight.validate()).to.throw('Capacity must be a positive integer');
        });

        it('should reject zero capacity', () => {
            const flight = new Flight({ ...baseSampleData, capacity: 0 });
            expect(() => flight.validate()).to.throw('Capacity must be a positive integer');
        });

        it('should reject non-integer capacity', () => {
            const flight = new Flight({ ...baseSampleData, capacity: 448.5 });
            expect(() => flight.validate()).to.throw('Capacity must be a positive integer');
        });

        it('should reject non-boolean completed (string)', () => {
            const flight = new Flight({ ...baseSampleData, completed: 'true' });
            expect(() => flight.validate()).to.throw('Completed must be a boolean value');
        });

        it('should reject non-boolean completed (number)', () => {
            const flight = new Flight({ ...baseSampleData, completed: 1 });
            expect(() => flight.validate()).to.throw('Completed must be a boolean value');
        });

        it('should reject null completed', () => {
            const flight = new Flight({ ...baseSampleData, completed: null });
            expect(() => flight.validate()).to.throw('Completed must be a boolean value');
        });

        it('should accept boolean false for completed', () => {
            const flight = new Flight({ ...baseSampleData, completed: false });
            expect(() => flight.validate()).to.not.throw();
        });
    });

    describe('prepareForSave', () => {
        it('should update metadata with user information', () => {
            const flight = new Flight(baseSampleData);
            const user = { firstName: 'John', lastName: 'Doe' };
            
            flight.prepareForSave(user);
            
            expect(flight.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(flight.metadata.updated_by).to.equal('John Doe');
        });

        it('should set created_at and created_by if not present', () => {
            const flight = new Flight(baseSampleData);
            const user = { firstName: 'John', lastName: 'Doe' };
            
            flight.prepareForSave(user);
            
            expect(flight.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(flight.metadata.created_by).to.equal('John Doe');
        });

        it('should not overwrite existing created_at and created_by', () => {
            const flight = new Flight({
                ...baseSampleData,
                metadata: {
                    created_at: '2023-01-01T12:00:00Z',
                    created_by: 'Original User',
                    updated_at: '',
                    updated_by: ''
                }
            });
            const user = { firstName: 'John', lastName: 'Doe' };
            
            flight.prepareForSave(user);
            
            expect(flight.metadata.created_at).to.equal('2023-01-01T12:00:00Z');
            expect(flight.metadata.created_by).to.equal('Original User');
            expect(flight.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(flight.metadata.updated_by).to.equal('John Doe');
        });
    });

    describe('toJSON', () => {
        it('should convert flight to JSON format', () => {
            const flight = new Flight(baseSampleData);
            const json = flight.toJSON();
            
            expect(json).to.have.property('_id');
            expect(json).to.have.property('_rev');
            expect(json).to.have.property('type');
            expect(json).to.have.property('name');
            expect(json).to.have.property('flight_date');
            expect(json).to.have.property('capacity');
            expect(json).to.have.property('completed');
            expect(json).to.have.property('metadata');
        });

        it('should include all flight properties in JSON', () => {
            const flight = new Flight(baseSampleData);
            const json = flight.toJSON();
            
            expect(json.type).to.equal('Flight');
            expect(json.name).to.equal('SSHF-Nov2011');
            expect(json.flight_date).to.equal('2011-11-05');
            expect(json.capacity).to.equal(448);
            expect(json.completed).to.equal(true);
        });
    });

    describe('fromJSON', () => {
        it('should create flight instance from JSON', () => {
            const json = {
                _id: 'test-id',
                _rev: '1-abc',
                ...baseSampleData
            };
            const flight = Flight.fromJSON(json);
            
            expect(flight).to.be.instanceOf(Flight);
            expect(flight._id).to.equal('test-id');
            expect(flight._rev).to.equal('1-abc');
            expect(flight.name).to.equal('SSHF-Nov2011');
        });

        it('should populate all fields from complete JSON', () => {
            const json = {
                _id: 'test-id',
                _rev: '1-abc',
                type: 'Flight',
                name: 'SSHF-Dec2011',
                flight_date: '2011-12-05',
                capacity: 500,
                completed: false,
                metadata: {
                    created_at: '2023-01-01T12:00:00Z',
                    created_by: 'Test User',
                    updated_at: '2023-01-02T12:00:00Z',
                    updated_by: 'Test User 2'
                }
            };
            const flight = Flight.fromJSON(json);
            
            expect(flight._id).to.equal('test-id');
            expect(flight.name).to.equal('SSHF-Dec2011');
            expect(flight.capacity).to.equal(500);
            expect(flight.completed).to.equal(false);
            expect(flight.metadata.created_at).to.equal('2023-01-01T12:00:00Z');
        });
    });
});

