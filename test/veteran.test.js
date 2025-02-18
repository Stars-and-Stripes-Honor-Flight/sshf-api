import { expect } from 'chai';
import { Veteran } from '../models/veteran.js';

describe('Veteran Model', () => {
    let sampleVeteranData;

    beforeEach(() => {
        sampleVeteranData = {
            type: 'Veteran',
            name: {
                first: 'John',
                middle: 'Robert',
                last: 'Smith',
                nickname: 'Johnny'
            },
            birth_date: '1945-01-01',
            gender: 'M',
            address: {
                street: '123 Main St',
                city: 'Springfield',
                state: 'IL',
                zip: '62701',
                county: 'Sangamon',
                phone_day: '217-555-1234',
                phone_eve: '217-555-5678',
                phone_mbl: '217-555-9012',
                email: 'john.smith@email.com'
            },
            service: {
                branch: 'Army',
                rank: 'Sergeant',
                dates: '1965-1968',
                activity: 'Vietnam War'
            },
            flight: {
                id: 'SSHF-2024',
                status: 'Active',
                bus: 'Alpha1',
                seat: '1A'
            },
            medical: {
                level: '2',
                food_restriction: 'None'
            },
            weight: '180'
        };
    });

    describe('constructor', () => {
        it('should create a valid veteran instance with provided data', () => {
            const veteran = new Veteran(sampleVeteranData);
            expect(veteran.type).to.equal('Veteran');
            expect(veteran.name.first).to.equal('John');
            expect(veteran.address.city).to.equal('Springfield');
        });

        it('should create a veteran instance with default values when no data provided', () => {
            const veteran = new Veteran();
            expect(veteran.type).to.equal('');
            expect(veteran.name.first).to.equal('');
            expect(veteran.flight.status).to.equal('Active');
        });
    });

    describe('validate', () => {
        it('should validate a correct veteran record', () => {
            const veteran = new Veteran(sampleVeteranData);
            expect(veteran.validate()).to.be.true;
        });

        it('should reject invalid first name', () => {
            sampleVeteranData.name.first = '12';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Validation failed');
        });

        it('should reject invalid phone format', () => {
            sampleVeteranData.address.phone_day = '1234';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Day phone is required');
        });

        it('should reject invalid medical level', () => {
            sampleVeteranData.medical.level = '5';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Medical level must be');
        });

        it('should reject invalid flight status', () => {
            sampleVeteranData.flight.status = 'Invalid';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Invalid flight status');
        });
    });

    describe('prepareForSave', () => {
        it('should update metadata with user information', () => {
            const veteran = new Veteran(sampleVeteranData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            veteran.prepareForSave(user);
            
            expect(veteran.metadata.updated_by).to.equal('Admin User');
            expect(veteran.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('should set created_at and created_by if not present', () => {
            const veteran = new Veteran(sampleVeteranData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            veteran.prepareForSave(user);
            
            expect(veteran.metadata.created_by).to.equal('Admin User');
            expect(veteran.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });
    });

    describe('updateHistory', () => {
        it('should track flight changes', () => {
            const currentVeteran = new Veteran(sampleVeteranData);
            const newVeteran = new Veteran(sampleVeteranData);
            newVeteran.flight.bus = 'Bravo1';
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newVeteran.updateHistory(currentVeteran, user);
            
            expect(newVeteran.flight.history).to.have.lengthOf(1);
            expect(newVeteran.flight.history[0].change).to.include('changed bus from Alpha1 to Bravo1');
        });

        it('should track mail call changes', () => {
            const currentVeteran = new Veteran(sampleVeteranData);
            const newVeteran = new Veteran(sampleVeteranData);
            newVeteran.mail_call.received = true;
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newVeteran.updateHistory(currentVeteran, user);
            
            expect(newVeteran.call.history).to.have.lengthOf(1);
            expect(newVeteran.call.history[0].change).to.include('changed mail_call received');
        });
    });

    describe('toJSON', () => {
        it('should convert veteran to JSON format', () => {
            const veteran = new Veteran(sampleVeteranData);
            const json = veteran.toJSON();
            
            expect(json).to.have.property('type', 'Veteran');
            expect(json.name).to.deep.equal(sampleVeteranData.name);
            expect(json.address).to.deep.equal(sampleVeteranData.address);
        });
    });

    describe('fromJSON', () => {
        it('should create veteran instance from JSON', () => {
            const veteran = Veteran.fromJSON(sampleVeteranData);
            
            expect(veteran).to.be.instanceof(Veteran);
            expect(veteran.name.first).to.equal(sampleVeteranData.name.first);
            expect(veteran.address.city).to.equal(sampleVeteranData.address.city);
        });
    });
}); 