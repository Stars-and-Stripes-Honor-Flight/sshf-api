import { expect } from 'chai';
import { UnpairedVeteranResults } from '../models/unpaired_veteran_results.js';

describe('UnpairedVeteranResults', () => {
    const sampleData = {
        total_rows: 2,
        offset: 0,
        rows: [
            {
                id: 'doc1',
                key: ['Active', 'SMITH'],
                value: {
                    name: 'John Smith',
                    city: 'Chicago, IL',
                    flight: 'F23',
                    prefs: 'Prefers window seat'
                }
            },
            {
                id: 'doc2',
                key: ['Active', 'JONES'],
                value: {
                    name: 'Jane Jones',
                    city: 'New York, NY',
                    flight: 'F24',
                    prefs: ''
                }
            }
        ]
    };

    describe('constructor', () => {
        it('should create instance with correct properties', () => {
            const results = new UnpairedVeteranResults(sampleData);
            expect(results.results).to.be.an('array');
            expect(results.results).to.have.lengthOf(2);
        });

        it('should map rows to results with id, name, city, flight, prefs', () => {
            const results = new UnpairedVeteranResults(sampleData);
            expect(results.results[0]).to.deep.equal({
                id: 'doc1',
                name: 'John Smith',
                city: 'Chicago, IL',
                flight: 'F23',
                prefs: 'Prefers window seat'
            });
            expect(results.results[1]).to.deep.equal({
                id: 'doc2',
                name: 'Jane Jones',
                city: 'New York, NY',
                flight: 'F24',
                prefs: ''
            });
        });

        it('should handle empty rows array', () => {
            const emptyData = {
                total_rows: 0,
                offset: 0,
                rows: []
            };
            const results = new UnpairedVeteranResults(emptyData);
            expect(results.results).to.be.an('array');
            expect(results.results).to.have.lengthOf(0);
        });

        it('should use empty string defaults for missing value fields', () => {
            const incompleteData = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'doc1',
                        key: ['Active', 'SMITH'],
                        value: {
                            name: 'John Smith'
                            // Missing city, flight, prefs
                        }
                    }
                ]
            };
            const results = new UnpairedVeteranResults(incompleteData);
            expect(results.results[0]).to.deep.equal({
                id: 'doc1',
                name: 'John Smith',
                city: '',
                flight: '',
                prefs: ''
            });
        });

        it('should handle null values in value fields', () => {
            const nullData = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'doc1',
                        key: ['Active', 'SMITH'],
                        value: {
                            name: null,
                            city: null,
                            flight: null,
                            prefs: null
                        }
                    }
                ]
            };
            const results = new UnpairedVeteranResults(nullData);
            // null || '' will result in '' due to the || operator
            expect(results.results[0].name).to.equal('');
            expect(results.results[0].city).to.equal('');
            expect(results.results[0].flight).to.equal('');
            expect(results.results[0].prefs).to.equal('');
        });

        it('should handle undefined values in value fields', () => {
            const undefinedData = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'doc1',
                        key: ['Active', 'SMITH'],
                        value: {
                            name: 'John Smith'
                            // city, flight, prefs are undefined
                        }
                    }
                ]
            };
            const results = new UnpairedVeteranResults(undefinedData);
            expect(results.results[0].name).to.equal('John Smith');
            expect(results.results[0].city).to.equal('');
            expect(results.results[0].flight).to.equal('');
            expect(results.results[0].prefs).to.equal('');
        });

        it('should handle single row', () => {
            const singleRowData = {
                total_rows: 1,
                offset: 0,
                rows: [
                    {
                        id: 'doc1',
                        key: ['Active', 'SMITH'],
                        value: {
                            name: 'John Smith',
                            city: 'Chicago, IL',
                            flight: 'F23',
                            prefs: 'Prefers window seat'
                        }
                    }
                ]
            };
            const results = new UnpairedVeteranResults(singleRowData);
            expect(results.results).to.have.lengthOf(1);
            expect(results.results[0].id).to.equal('doc1');
            expect(results.results[0].name).to.equal('John Smith');
        });

        it('should ignore key field from rows', () => {
            const results = new UnpairedVeteranResults(sampleData);
            // Key should not be in the results
            expect(results.results[0]).to.not.have.property('key');
        });

        it('should ignore total_rows and offset from input data', () => {
            const results = new UnpairedVeteranResults(sampleData);
            // These should not be in the results
            expect(results.results).to.not.have.property('total_rows');
            expect(results.results).to.not.have.property('offset');
        });
    });

    describe('getResults', () => {
        it('should return the results array', () => {
            const results = new UnpairedVeteranResults(sampleData);
            const returnedResults = results.getResults();
            expect(returnedResults).to.be.an('array');
            expect(returnedResults).to.have.lengthOf(2);
            expect(returnedResults).to.deep.equal(results.results);
        });

        it('should return empty array when no rows', () => {
            const emptyData = {
                total_rows: 0,
                offset: 0,
                rows: []
            };
            const results = new UnpairedVeteranResults(emptyData);
            expect(results.getResults()).to.be.an('array').that.is.empty;
        });
    });

    describe('toJSON', () => {
        it('should return the results array directly', () => {
            const results = new UnpairedVeteranResults(sampleData);
            const json = results.toJSON();
            
            expect(json).to.be.an('array');
            expect(json).to.have.lengthOf(2);
            expect(json).to.deep.equal(results.results);
        });

        it('should return array with correct structure', () => {
            const results = new UnpairedVeteranResults(sampleData);
            const json = results.toJSON();
            
            expect(json[0]).to.have.property('id');
            expect(json[0]).to.have.property('name');
            expect(json[0]).to.have.property('city');
            expect(json[0]).to.have.property('flight');
            expect(json[0]).to.have.property('prefs');
            expect(json[0]).to.not.have.property('key');
            expect(json[0]).to.not.have.property('value');
        });

        it('should return empty array for empty results', () => {
            const emptyData = {
                total_rows: 0,
                offset: 0,
                rows: []
            };
            const results = new UnpairedVeteranResults(emptyData);
            const json = results.toJSON();
            
            expect(json).to.be.an('array').that.is.empty;
        });

        it('should return same reference as getResults', () => {
            const results = new UnpairedVeteranResults(sampleData);
            const json = results.toJSON();
            const getResults = results.getResults();
            
            expect(json).to.equal(getResults);
        });
    });
});

