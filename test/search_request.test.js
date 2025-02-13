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
        });

        it('should use provided values', () => {
            const data = {
                limit: 50,
                lastname: 'Smith',
                status: 'Flown',
                flight: 'SSHF-Nov2024'
            };
            const request = new SearchRequest(data);
            expect(request.limit).to.equal(50);
            expect(request.lastname).to.equal('Smith');
            expect(request.status).to.equal('Flown');
            expect(request.flight).to.equal('All'); // Should be 'All' due to validation
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
    });

    describe('getViewName', () => {
        it('should return all_by_status_and_name when status is not All', () => {
            const request = new SearchRequest({ status: 'Active' });
            expect(request.getViewName()).to.equal('all_by_status_and_name');
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
    });
}); 