import { expect } from 'chai';
import { WaitlistRequest } from '../models/waitlist_request.js';

describe('WaitlistRequest', () => {
    describe('constructor', () => {
        it('should set default values when no data provided', () => {
            const request = new WaitlistRequest();
            
            expect(request.type).to.equal('');
            expect(request.offset).to.equal(0);
            expect(request.limit).to.equal(20);
        });

        it('should accept type parameter', () => {
            const request = new WaitlistRequest({ type: 'veterans' });
            
            expect(request.type).to.equal('veterans');
        });

        it('should accept offset parameter', () => {
            const request = new WaitlistRequest({ offset: 10 });
            
            expect(request.offset).to.equal(10);
        });

        it('should accept limit parameter', () => {
            const request = new WaitlistRequest({ limit: 50 });
            
            expect(request.limit).to.equal(50);
        });

        it('should parse string offset to integer', () => {
            const request = new WaitlistRequest({ offset: '25' });
            
            expect(request.offset).to.equal(25);
        });

        it('should parse string limit to integer', () => {
            const request = new WaitlistRequest({ limit: '30' });
            
            expect(request.limit).to.equal(30);
        });

        it('should set offset to 0 if negative value provided', () => {
            const request = new WaitlistRequest({ offset: -5 });
            
            expect(request.offset).to.equal(0);
        });

        it('should set limit to default 20 if value less than 1 provided', () => {
            const request = new WaitlistRequest({ limit: 0 });
            
            expect(request.limit).to.equal(20);
        });

        it('should set limit to default 20 if negative value provided', () => {
            const request = new WaitlistRequest({ limit: -10 });
            
            expect(request.limit).to.equal(20);
        });

        it('should handle all parameters together', () => {
            const request = new WaitlistRequest({
                type: 'guardians',
                offset: 20,
                limit: 15
            });
            
            expect(request.type).to.equal('guardians');
            expect(request.offset).to.equal(20);
            expect(request.limit).to.equal(15);
        });
    });

    describe('validate', () => {
        it('should return valid false when type is missing', () => {
            const request = new WaitlistRequest();
            const result = request.validate();
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('type parameter is required');
        });

        it('should return valid false when type is empty string', () => {
            const request = new WaitlistRequest({ type: '' });
            const result = request.validate();
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('type parameter is required');
        });

        it('should return valid false when type is invalid', () => {
            const request = new WaitlistRequest({ type: 'invalid' });
            const result = request.validate();
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('type must be either "veterans" or "guardians"');
        });

        it('should return valid true for veterans type', () => {
            const request = new WaitlistRequest({ type: 'veterans' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });

        it('should return valid true for guardians type', () => {
            const request = new WaitlistRequest({ type: 'guardians' });
            const result = request.validate();
            
            expect(result.valid).to.be.true;
            expect(result.error).to.be.undefined;
        });
    });

    describe('getViewName', () => {
        it('should return waitlist_veterans for veterans type', () => {
            const request = new WaitlistRequest({ type: 'veterans' });
            
            expect(request.getViewName()).to.equal('waitlist_veterans');
        });

        it('should return waitlist_guardians for guardians type', () => {
            const request = new WaitlistRequest({ type: 'guardians' });
            
            expect(request.getViewName()).to.equal('waitlist_guardians');
        });

        it('should return null for empty type', () => {
            const request = new WaitlistRequest();
            
            expect(request.getViewName()).to.be.null;
        });

        it('should return null for invalid type', () => {
            const request = new WaitlistRequest({ type: 'invalid' });
            
            expect(request.getViewName()).to.be.null;
        });
    });

    describe('toQueryParams', () => {
        it('should include limit and include_docs by default', () => {
            const request = new WaitlistRequest({ type: 'veterans' });
            const params = request.toQueryParams();
            
            expect(params).to.include('limit=20');
            expect(params).to.include('include_docs=true');
        });

        it('should not include skip when offset is 0', () => {
            const request = new WaitlistRequest({ type: 'veterans', offset: 0 });
            const params = request.toQueryParams();
            
            expect(params).to.not.include('skip=');
        });

        it('should include skip when offset is greater than 0', () => {
            const request = new WaitlistRequest({ type: 'veterans', offset: 10 });
            const params = request.toQueryParams();
            
            expect(params).to.include('skip=10');
        });

        it('should include custom limit value', () => {
            const request = new WaitlistRequest({ type: 'veterans', limit: 50 });
            const params = request.toQueryParams();
            
            expect(params).to.include('limit=50');
        });

        it('should build correct query string with all parameters', () => {
            const request = new WaitlistRequest({ 
                type: 'guardians', 
                offset: 20, 
                limit: 25 
            });
            const params = request.toQueryParams();
            
            expect(params).to.include('skip=20');
            expect(params).to.include('limit=25');
            expect(params).to.include('include_docs=true');
        });
    });

    describe('toJSON', () => {
        it('should return object with all properties', () => {
            const request = new WaitlistRequest({
                type: 'veterans',
                offset: 10,
                limit: 25
            });
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                type: 'veterans',
                offset: 10,
                limit: 25,
                viewName: 'waitlist_veterans'
            });
        });

        it('should include null viewName for invalid type', () => {
            const request = new WaitlistRequest({
                type: 'invalid',
                offset: 0,
                limit: 20
            });
            const json = request.toJSON();
            
            expect(json.viewName).to.be.null;
        });

        it('should return correct values with default parameters', () => {
            const request = new WaitlistRequest({ type: 'guardians' });
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                type: 'guardians',
                offset: 0,
                limit: 20,
                viewName: 'waitlist_guardians'
            });
        });
    });
});

