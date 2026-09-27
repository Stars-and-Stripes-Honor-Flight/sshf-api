import { expect } from 'chai';
import { UnpairedVeteranResult } from '../models/unpaired_veteran_result.js';

describe('UnpairedVeteranResult', () => {
    describe('constructor', () => {
        it('should create instance with all fields', () => {
            const data = {
                name: 'John Doe',
                city: 'Chicago, IL',
                flight: 'F23',
                prefs: 'Window seat'
            };
            const result = new UnpairedVeteranResult(data);
            
            expect(result.name).to.equal('John Doe');
            expect(result.city).to.equal('Chicago, IL');
            expect(result.flight).to.equal('F23');
            expect(result.prefs).to.equal('Window seat');
        });

        it('should use empty string defaults for missing fields', () => {
            const result = new UnpairedVeteranResult({});
            
            expect(result.name).to.equal('');
            expect(result.city).to.equal('');
            expect(result.flight).to.equal('');
            expect(result.prefs).to.equal('');
        });

        it('should handle null values', () => {
            const data = {
                name: null,
                city: null,
                flight: null,
                prefs: null
            };
            const result = new UnpairedVeteranResult(data);
            
            expect(result.name).to.equal('');
            expect(result.city).to.equal('');
            expect(result.flight).to.equal('');
            expect(result.prefs).to.equal('');
        });
    });

    describe('getter methods', () => {
        const data = {
            name: 'Jane Smith',
            city: 'New York, NY',
            flight: 'F24',
            prefs: 'Aisle seat'
        };
        const result = new UnpairedVeteranResult(data);

        it('should return name via getName', () => {
            expect(result.getName()).to.equal('Jane Smith');
        });

        it('should return city via getCity', () => {
            expect(result.getCity()).to.equal('New York, NY');
        });

        it('should return flight via getFlight', () => {
            expect(result.getFlight()).to.equal('F24');
        });

        it('should return prefs via getPrefs', () => {
            expect(result.getPrefs()).to.equal('Aisle seat');
        });
    });

    describe('toJSON', () => {
        it('should return object with all fields', () => {
            const data = {
                name: 'Bob Johnson',
                city: 'Los Angeles, CA',
                flight: 'F25',
                prefs: 'No preferences'
            };
            const result = new UnpairedVeteranResult(data);
            const json = result.toJSON();
            
            expect(json).to.deep.equal({
                name: 'Bob Johnson',
                city: 'Los Angeles, CA',
                flight: 'F25',
                prefs: 'No preferences'
            });
        });

        it('should return object with empty strings for missing fields', () => {
            const result = new UnpairedVeteranResult({});
            const json = result.toJSON();
            
            expect(json).to.deep.equal({
                name: '',
                city: '',
                flight: '',
                prefs: ''
            });
        });
    });
});
