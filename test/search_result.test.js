import { expect } from 'chai';
import { SearchResult } from '../models/search_result.js';

describe('SearchResult', () => {
    const sampleData = {
        type: 'veteran',
        name: 'John Smith',
        city: 'Springfield',
        appdate: '2024-01-01',
        flight: 'SSHF-Nov2024',
        status: 'Active',
        pairing: 'Guardian Name',
        pairingId: '12345'
    };

    describe('constructor', () => {
        it('should create instance with all properties', () => {
            const result = new SearchResult(sampleData);
            expect(result.type).to.equal(sampleData.type);
            expect(result.name).to.equal(sampleData.name);
            expect(result.city).to.equal(sampleData.city);
            expect(result.appdate).to.equal(sampleData.appdate);
            expect(result.flight).to.equal(sampleData.flight);
            expect(result.status).to.equal(sampleData.status);
            expect(result.pairing).to.equal(sampleData.pairing);
            expect(result.pairingId).to.equal(sampleData.pairingId);
        });
    });

    describe('getter methods', () => {
        const result = new SearchResult(sampleData);

        it('should return correct values', () => {
            expect(result.getType()).to.equal(sampleData.type);
            expect(result.getName()).to.equal(sampleData.name);
            expect(result.getCity()).to.equal(sampleData.city);
            expect(result.getAppDate()).to.equal(sampleData.appdate);
            expect(result.getFlight()).to.equal(sampleData.flight);
            expect(result.getStatus()).to.equal(sampleData.status);
            expect(result.getPairing()).to.equal(sampleData.pairing);
            expect(result.getPairingId()).to.equal(sampleData.pairingId);
        });
    });

    describe('toJSON', () => {
        it('should return correct JSON representation', () => {
            const result = new SearchResult(sampleData);
            const json = result.toJSON();
            expect(json).to.deep.equal(sampleData);
        });
    });
}); 