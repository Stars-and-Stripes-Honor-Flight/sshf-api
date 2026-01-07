import { expect } from 'chai';
import { RecentActivityEntry } from '../models/recent_activity_entry.js';

describe('RecentActivityEntry', () => {
    describe('constructor', () => {
        it('should set default values when no data provided', () => {
            const entry = new RecentActivityEntry();
            
            expect(entry.id).to.equal('');
            expect(entry.type).to.equal('');
            expect(entry.name).to.equal('');
            expect(entry.city).to.equal('');
            expect(entry.appdate).to.equal('');
            expect(entry.recdate).to.equal('');
            expect(entry.recby).to.equal('');
            expect(entry.change).to.equal('');
        });

        it('should accept all properties', () => {
            const entry = new RecentActivityEntry({
                id: 'abc123',
                type: 'Veteran',
                name: 'John Smith',
                city: 'Chicago, IL',
                appdate: '2025-01-15',
                recdate: '2025-12-29T01:04:40Z',
                recby: 'Jane Doe',
                change: 'changed flight from: None to: SSHF-Test01'
            });
            
            expect(entry.id).to.equal('abc123');
            expect(entry.type).to.equal('Veteran');
            expect(entry.name).to.equal('John Smith');
            expect(entry.city).to.equal('Chicago, IL');
            expect(entry.appdate).to.equal('2025-01-15');
            expect(entry.recdate).to.equal('2025-12-29T01:04:40Z');
            expect(entry.recby).to.equal('Jane Doe');
            expect(entry.change).to.equal('changed flight from: None to: SSHF-Test01');
        });

        it('should handle partial data', () => {
            const entry = new RecentActivityEntry({
                id: 'xyz789',
                type: 'Guardian'
            });
            
            expect(entry.id).to.equal('xyz789');
            expect(entry.type).to.equal('Guardian');
            expect(entry.name).to.equal('');
            expect(entry.city).to.equal('');
        });
    });

    describe('fromRow', () => {
        it('should create entry from CouchDB view row', () => {
            const row = {
                id: '0ccf1cdbac2279ae3e2de3791209c357',
                key: '2025-12-29T01:04:40Z',
                value: {
                    type: 'Guardian',
                    name: 'Catherine Manaspas',
                    city: 'Chippewa Falls, WI',
                    appdate: '2025-11-18',
                    recdate: '2025-12-29T01:04:40Z',
                    recby: 'Steve Schmechel',
                    change: 'changed flight from: None to: SSHF-Test01'
                }
            };
            
            const entry = RecentActivityEntry.fromRow(row);
            
            expect(entry.id).to.equal('0ccf1cdbac2279ae3e2de3791209c357');
            expect(entry.type).to.equal('Guardian');
            expect(entry.name).to.equal('Catherine Manaspas');
            expect(entry.city).to.equal('Chippewa Falls, WI');
            expect(entry.appdate).to.equal('2025-11-18');
            expect(entry.recdate).to.equal('2025-12-29T01:04:40Z');
            expect(entry.recby).to.equal('Steve Schmechel');
            expect(entry.change).to.equal('changed flight from: None to: SSHF-Test01');
        });

        it('should create entry from veteran row', () => {
            const row = {
                id: '0ccf1cdbac2279ae3e2de3791209b87a',
                key: '2025-12-29T01:04:40Z',
                value: {
                    type: 'Veteran',
                    name: 'Ronald Schnelberger',
                    city: 'Hartland, WI',
                    appdate: '2025-11-18',
                    recdate: '2025-12-29T01:04:40Z',
                    recby: 'Steve Schmechel',
                    change: 'changed flight from: None to: SSHF-Test01'
                }
            };
            
            const entry = RecentActivityEntry.fromRow(row);
            
            expect(entry.id).to.equal('0ccf1cdbac2279ae3e2de3791209b87a');
            expect(entry.type).to.equal('Veteran');
            expect(entry.name).to.equal('Ronald Schnelberger');
            expect(entry.city).to.equal('Hartland, WI');
        });

        it('should handle row with missing value properties', () => {
            const row = {
                id: 'test123',
                key: '2025-12-29T01:04:40Z',
                value: {
                    type: 'Veteran'
                }
            };
            
            const entry = RecentActivityEntry.fromRow(row);
            
            expect(entry.id).to.equal('test123');
            expect(entry.type).to.equal('Veteran');
            expect(entry.name).to.equal('');
            expect(entry.city).to.equal('');
        });

        it('should handle row with null value', () => {
            const row = {
                id: 'test456',
                key: '2025-12-29T01:04:40Z',
                value: null
            };
            
            const entry = RecentActivityEntry.fromRow(row);
            
            expect(entry.id).to.equal('test456');
            expect(entry.type).to.equal('');
        });

        it('should handle row with undefined value', () => {
            const row = {
                id: 'test789',
                key: '2025-12-29T01:04:40Z'
            };
            
            const entry = RecentActivityEntry.fromRow(row);
            
            expect(entry.id).to.equal('test789');
            expect(entry.type).to.equal('');
        });
    });

    describe('toJSON', () => {
        it('should return object with all properties', () => {
            const entry = new RecentActivityEntry({
                id: 'abc123',
                type: 'Veteran',
                name: 'John Smith',
                city: 'Chicago, IL',
                appdate: '2025-01-15',
                recdate: '2025-12-29T01:04:40Z',
                recby: 'Jane Doe',
                change: 'added new application'
            });
            
            const json = entry.toJSON();
            
            expect(json).to.deep.equal({
                id: 'abc123',
                type: 'Veteran',
                name: 'John Smith',
                city: 'Chicago, IL',
                appdate: '2025-01-15',
                recdate: '2025-12-29T01:04:40Z',
                recby: 'Jane Doe',
                change: 'added new application'
            });
        });

        it('should return default empty strings for missing properties', () => {
            const entry = new RecentActivityEntry();
            const json = entry.toJSON();
            
            expect(json).to.deep.equal({
                id: '',
                type: '',
                name: '',
                city: '',
                appdate: '',
                recdate: '',
                recby: '',
                change: ''
            });
        });

        it('should properly serialize entry created from row', () => {
            const row = {
                id: 'row123',
                key: '2025-12-29T01:04:40Z',
                value: {
                    type: 'Guardian',
                    name: 'Test User',
                    city: 'Test City, ST',
                    appdate: '2025-01-01',
                    recdate: '2025-12-29T01:04:40Z',
                    recby: 'Admin',
                    change: 'test change'
                }
            };
            
            const entry = RecentActivityEntry.fromRow(row);
            const json = entry.toJSON();
            
            expect(json.id).to.equal('row123');
            expect(json.type).to.equal('Guardian');
            expect(json.name).to.equal('Test User');
            expect(json.city).to.equal('Test City, ST');
            expect(json.appdate).to.equal('2025-01-01');
            expect(json.recdate).to.equal('2025-12-29T01:04:40Z');
            expect(json.recby).to.equal('Admin');
            expect(json.change).to.equal('test change');
        });
    });
});

