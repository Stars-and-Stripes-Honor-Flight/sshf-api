import { expect } from 'chai';
import { SearchRequest } from '../models/search_request.js';

describe('SearchRequest', () => {
    describe('constructor', () => {
        it('should use default values when no data provided', () => {
            const request = new SearchRequest();
            expect(request.limit).to.equal(25);
            expect(request.lastname).to.equal('');
            expect(request.status).to.equal('Active');
            expect(request.flight).to.equal('All');
            expect(request.phone_num).to.equal('');
        });

        it('should use provided values', () => {
            const data = {
                limit: 50,
                lastname: 'Smith',
                status: 'Flown',
                flight: 'SSHF-Nov2024',
                phone_num: ''
            };
            const request = new SearchRequest(data);
            expect(request.limit).to.equal(50);
            expect(request.lastname).to.equal('Smith');
            expect(request.status).to.equal('Flown');
            expect(request.flight).to.equal('All'); // Should be 'All' due to validation
            expect(request.phone_num).to.equal('');
        });
    });

    describe('validateAndNormalize', () => {
        it('should force flight to All when status is not All', () => {
            const request = new SearchRequest({
                status: 'Active',
                flight: 'SSHF-Nov2024'
            });
            expect(request.flight).to.equal('All');
        });

        it('should not force flight to All when phone_num is provided', () => {
            const request = new SearchRequest({
                status: 'Active',
                flight: 'SSHF-Nov2024',
                phone_num: '555-1212'
            });
            expect(request.flight).to.equal('SSHF-Nov2024');
        });

        it('should throw validation error when phone_num has fewer than 3 digits', () => {
            expect(() => new SearchRequest({
                phone_num: '5-5'
            })).to.throw('Validation failed: phone_num must contain at least 3 numeric digits');
        });
    });

    describe('getViewName', () => {
        it('should return all_by_status_and_name when status is not All', () => {
            const request = new SearchRequest({ status: 'Active' });
            expect(request.getViewName()).to.equal('all_by_status_and_name');
        });

        it('should return all_by_phone_number when phone_num is provided', () => {
            const request = new SearchRequest({
                phone_num: '(312) 555-1212',
                status: 'All',
                flight: 'All'
            });
            expect(request.getViewName()).to.equal('all_by_phone_number2');
        });

        it('should return all_by_flight_and_name when flight is not All', () => {
            const request = new SearchRequest({ 
                status: 'All',
                flight: 'SSHF-Nov2024'
            });
            expect(request.getViewName()).to.equal('all_by_flight_and_name');
        });

        it('should return all_by_name when both status and flight are All', () => {
            const request = new SearchRequest({ 
                status: 'All',
                flight: 'All'
            });
            expect(request.getViewName()).to.equal('all_by_name');
        });
    });

    describe('toQueryParams', () => {
        it('should generate correct params for status search', () => {
            const request = new SearchRequest({
                status: 'Active',
                lastname: 'Smith'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["Active","Smith"]');
            expect(params.get('endkey')).to.equal('["Active","\ufff0"]');
        });

        it('should generate correct params for phone search', () => {
            const request = new SearchRequest({
                lastname: 'Smith',
                phone_num: '(312) 555-1212',
                status: 'All',
                flight: 'All'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["3125551212"]');
            expect(params.get('endkey')).to.equal('["3125551212\ufff0"]');
            expect(params.get('limit')).to.equal('25');
        });

        it('should use elevated fetch limit for phone search when status or flight filters apply', () => {
            const request = new SearchRequest({
                phone_num: '(312) 555-1212',
                status: 'Active',
                flight: 'All',
                limit: 5
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('limit')).to.equal(String(SearchRequest.PHONE_PREFILTER_FETCH_LIMIT));
        });

        it('should use user limit for phone search when status and flight are All', () => {
            const request = new SearchRequest({
                phone_num: '(312) 555-1212',
                status: 'All',
                flight: 'All',
                limit: 5
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('limit')).to.equal('5');
        });

        it('should ignore lastname for key generation when phone_num is provided', () => {
            const request = new SearchRequest({
                lastname: 'CompletelyIgnored',
                phone_num: '999-8888'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["9998888"]');
        });

        it('should generate correct params for flight search', () => {
            const request = new SearchRequest({
                status: 'All',
                flight: 'SSHF-Nov2024',
                lastname: 'Smith'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["SSHF-Nov2024","Smith"]');
            expect(params.get('endkey')).to.equal('["SSHF-Nov2024","\ufff0"]');
        });

        it('should generate correct params for name-only search', () => {
            const request = new SearchRequest({
                status: 'All',
                flight: 'All',
                lastname: 'Smith'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["Smith"]');
            expect(params.get('endkey')).to.equal('["\ufff0"]');
            expect(params.get('limit')).to.equal('25');
        });

        it('should strip spaces from lastname startkeys to match the name index', () => {
            const cases = [
                {
                    label: 'Le Roy',
                    status: 'Active',
                    flight: 'All',
                    startkey: '["Active","LeRoy"]',
                    endkey: '["Active","\ufff0"]'
                },
                {
                    label: 'le roy',
                    status: 'All',
                    flight: 'All',
                    startkey: '["leroy"]',
                    endkey: '["\ufff0"]'
                },
                {
                    label: 'LeRoy',
                    status: 'Active',
                    flight: 'All',
                    startkey: '["Active","LeRoy"]',
                    endkey: '["Active","\ufff0"]'
                },
                {
                    label: 'leroy',
                    status: 'All',
                    flight: 'SSHF-Nov2024',
                    startkey: '["SSHF-Nov2024","leroy"]',
                    endkey: '["SSHF-Nov2024","\ufff0"]'
                }
            ];

            cases.forEach(({ label, status, flight, startkey, endkey }) => {
                const request = new SearchRequest({
                    status,
                    flight,
                    lastname: label
                });
                const params = new URLSearchParams(request.toQueryParams());
                expect(params.get('startkey'), label).to.equal(startkey);
                expect(params.get('endkey'), label).to.equal(endkey);
                expect(request.lastname, label).to.equal(label);
            });
        });

        it('should strip apostrophes and periods from lastname startkeys and keep other characters', () => {
            const obrien = new SearchRequest({
                status: 'All',
                flight: 'All',
                lastname: "O'Brien"
            });
            expect(new URLSearchParams(obrien.toQueryParams()).get('startkey')).to.equal('["OBrien"]');

            const stJohn = new SearchRequest({
                status: 'Active',
                lastname: 'St. John'
            });
            expect(new URLSearchParams(stJohn.toQueryParams()).get('startkey')).to.equal('["Active","StJohn"]');

            const hyphenated = new SearchRequest({
                status: 'All',
                flight: 'SSHF-Nov2024',
                lastname: 'Smith-Jones'
            });
            expect(new URLSearchParams(hyphenated.toQueryParams()).get('startkey')).to.equal('["SSHF-Nov2024","Smith-Jones"]');
        });
    });

    describe('toJSON', () => {
        it('should return correct JSON representation', () => {
            const request = new SearchRequest({
                limit: 50,
                lastname: 'Smith',
                status: 'Active',
                flight: 'All',
                phone_num: ''
            });
            
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                limit: 50,
                lastname: 'Smith',
                status: 'Active',
                flight: 'All',
                phone_num: '',
                viewName: 'all_by_status_and_name'
            });
        });

        it('should keep the typed lastname when spaces are removed only for the index key', () => {
            const request = new SearchRequest({
                lastname: 'Le Roy',
                status: 'Active'
            });

            expect(request.toJSON().lastname).to.equal('Le Roy');
        });
    });
}); 