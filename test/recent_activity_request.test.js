import { expect } from 'chai';
import { RecentActivityRequest } from '../models/recent_activity_request.js';

describe('RecentActivityRequest', () => {
    describe('constructor', () => {
        it('should set default values when no data provided', () => {
            const request = new RecentActivityRequest();
            
            expect(request.type).to.equal('');
            expect(request.offset).to.equal(0);
            expect(request.limit).to.equal(20);
        });

        it('should accept type parameter', () => {
            const request = new RecentActivityRequest({ type: 'modified' });
            
            expect(request.type).to.equal('modified');
        });

        it('should accept offset parameter', () => {
            const request = new RecentActivityRequest({ offset: 10 });
            
            expect(request.offset).to.equal(10);
        });

        it('should accept limit parameter', () => {
            const request = new RecentActivityRequest({ limit: 50 });
            
            expect(request.limit).to.equal(50);
        });

        it('should parse string offset to integer', () => {
            const request = new RecentActivityRequest({ offset: '25' });
            
            expect(request.offset).to.equal(25);
        });

        it('should parse string limit to integer', () => {
            const request = new RecentActivityRequest({ limit: '30' });
            
            expect(request.limit).to.equal(30);
        });

        it('should set offset to 0 if negative value provided', () => {
            const request = new RecentActivityRequest({ offset: -5 });
            
            expect(request.offset).to.equal(0);
        });

        it('should set limit to default 20 if value less than 1 provided', () => {
            const request = new RecentActivityRequest({ limit: 0 });
            
            expect(request.limit).to.equal(20);
        });

        it('should set limit to default 20 if negative value provided', () => {
            const request = new RecentActivityRequest({ limit: -10 });
            
            expect(request.limit).to.equal(20);
        });

        it('should handle all parameters together', () => {
            const request = new RecentActivityRequest({
                type: 'added',
                offset: 20,
                limit: 15
            });
            
            expect(request.type).to.equal('added');
            expect(request.offset).to.equal(20);
            expect(request.limit).to.equal(15);
        });
    });

    describe('validate', () => {
        it('should return valid false when type is missing', () => {
            const request = new RecentActivityRequest();
            const result = request.validate();
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('type parameter is required');
        });

        it('should return valid false when type is empty string', () => {
            const request = new RecentActivityRequest({ type: '' });
            const result = request.validate();
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('type parameter is required');
        });

        it('should return valid false when type is invalid', () => {
            const request = new RecentActivityRequest({ type: 'invalid' });
            const result = request.validate();
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('type must be one of: modified, added, call, flight, pairing');
        });

        it('should return valid true for modified type', () => {
            const request = new RecentActivityRequest({ type: 'modified' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });

        it('should return valid true for added type', () => {
            const request = new RecentActivityRequest({ type: 'added' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });

        it('should return valid true for call type', () => {
            const request = new RecentActivityRequest({ type: 'call' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });

        it('should return valid true for flight type', () => {
            const request = new RecentActivityRequest({ type: 'flight' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });

        it('should return valid true for pairing type', () => {
            const request = new RecentActivityRequest({ type: 'pairing' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });
    });

    describe('getViewName', () => {
        it('should return admin_recent_changes for modified type', () => {
            const request = new RecentActivityRequest({ type: 'modified' });
            
            expect(request.getViewName()).to.equal('admin_recent_changes');
        });

        it('should return admin_recent_additions for added type', () => {
            const request = new RecentActivityRequest({ type: 'added' });
            
            expect(request.getViewName()).to.equal('admin_recent_additions');
        });

        it('should return admin_recent_call_changes for call type', () => {
            const request = new RecentActivityRequest({ type: 'call' });
            
            expect(request.getViewName()).to.equal('admin_recent_call_changes');
        });

        it('should return admin_recent_flight_changes for flight type', () => {
            const request = new RecentActivityRequest({ type: 'flight' });
            
            expect(request.getViewName()).to.equal('admin_recent_flight_changes');
        });

        it('should return admin_recent_pairing_changes for pairing type', () => {
            const request = new RecentActivityRequest({ type: 'pairing' });
            
            expect(request.getViewName()).to.equal('admin_recent_pairing_changes');
        });

        it('should return null for empty type', () => {
            const request = new RecentActivityRequest();
            
            expect(request.getViewName()).to.be.null;
        });

        it('should return null for invalid type', () => {
            const request = new RecentActivityRequest({ type: 'invalid' });
            
            expect(request.getViewName()).to.be.null;
        });
    });

    describe('toQueryParams', () => {
        it('should include limit and descending by default', () => {
            const request = new RecentActivityRequest({ type: 'modified' });
            const params = request.toQueryParams();
            
            expect(params).to.include('limit=20');
            expect(params).to.include('descending=true');
        });

        it('should not include skip when offset is 0', () => {
            const request = new RecentActivityRequest({ type: 'modified', offset: 0 });
            const params = request.toQueryParams();
            
            expect(params).to.not.include('skip=');
        });

        it('should include skip when offset is greater than 0', () => {
            const request = new RecentActivityRequest({ type: 'modified', offset: 10 });
            const params = request.toQueryParams();
            
            expect(params).to.include('skip=10');
        });

        it('should include custom limit value', () => {
            const request = new RecentActivityRequest({ type: 'modified', limit: 50 });
            const params = request.toQueryParams();
            
            expect(params).to.include('limit=50');
        });

        it('should build correct query string with all parameters', () => {
            const request = new RecentActivityRequest({ 
                type: 'added', 
                offset: 20, 
                limit: 25 
            });
            const params = request.toQueryParams();
            
            expect(params).to.include('skip=20');
            expect(params).to.include('limit=25');
            expect(params).to.include('descending=true');
        });
    });

    describe('toJSON', () => {
        it('should return object with all properties', () => {
            const request = new RecentActivityRequest({
                type: 'modified',
                offset: 10,
                limit: 25
            });
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                type: 'modified',
                offset: 10,
                limit: 25,
                viewName: 'admin_recent_changes'
            });
        });

        it('should include null viewName for invalid type', () => {
            const request = new RecentActivityRequest({
                type: 'invalid',
                offset: 0,
                limit: 20
            });
            const json = request.toJSON();
            
            expect(json.viewName).to.be.null;
        });

        it('should return correct values with default parameters', () => {
            const request = new RecentActivityRequest({ type: 'flight' });
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                type: 'flight',
                offset: 0,
                limit: 20,
                viewName: 'admin_recent_flight_changes'
            });
        });
    });
});

