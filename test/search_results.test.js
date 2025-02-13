import { expect } from 'chai';
import { SearchResults } from '../models/search_results.js';

describe('SearchResults', () => {
    const sampleData = {
        total_rows: 2,
        offset: 0,
        rows: [
            {
                id: '1',
                key: ['Active', 'Smith'],
                value: {
                    type: 'veteran',
                    name: 'John Smith',
                    city: 'Springfield',
                    appdate: '2024-01-01',
                    flight: 'SSHF-Nov2024',
                    status: 'Active',
                    pairing: 'Guardian Name',
                    pairingId: '12345'
                }
            },
            {
                id: '2',
                key: ['Active', 'Smith'],
                value: {
                    type: 'veteran',
                    name: 'Jane Smith',
                    city: 'Shelbyville',
                    appdate: '2024-01-02',
                    flight: 'SSHF-Nov2024',
                    status: 'Active',
                    pairing: null,
                    pairingId: null
                }
            }
        ]
    };

    describe('constructor', () => {
        it('should create instance with correct properties', () => {
            const results = new SearchResults(sampleData);
            expect(results.totalRows).to.equal(sampleData.total_rows);
            expect(results.offset).to.equal(sampleData.offset);
            expect(results.rows).to.have.lengthOf(2);
        });
    });

    describe('getter methods', () => {
        const results = new SearchResults(sampleData);

        it('should return correct values', () => {
            expect(results.getTotalRows()).to.equal(2);
            expect(results.getOffset()).to.equal(0);
            expect(results.getRows()).to.have.lengthOf(2);
        });

        it('getSearchResults should return array of SearchResult objects', () => {
            const searchResults = results.getSearchResults();
            expect(searchResults).to.have.lengthOf(2);
            expect(searchResults[0].getName()).to.equal('John Smith');
            expect(searchResults[1].getName()).to.equal('Jane Smith');
        });
    });

    describe('toJSON', () => {
        it('should return correct JSON representation', () => {
            const results = new SearchResults(sampleData);
            const json = results.toJSON();
            expect(json.total_rows).to.equal(sampleData.total_rows);
            expect(json.offset).to.equal(sampleData.offset);
            expect(json.rows).to.have.lengthOf(2);
            expect(json.rows[0].value.name).to.equal('John Smith');
        });
    });
}); 