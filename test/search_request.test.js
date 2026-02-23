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
            expect(request.getViewName()).to.equal('all_by_phone_number');
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
    });
}); 