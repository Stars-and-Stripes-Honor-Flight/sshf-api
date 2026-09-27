import { expect } from 'chai';
import { QueryRequest } from '../models/query_request.js';

describe('QueryRequest primitive value handling', () => {
    it('should allow selector with null values', () => {
        const request = new QueryRequest({
            selector: { type: 'veteran', optional_field: null }
        });
        expect(request.selector.optional_field).to.equal(null);
    });

    it('should allow selector with primitive number values', () => {
        const request = new QueryRequest({
            selector: { type: 'veteran', count: 5 }
        });
        expect(request.selector.count).to.equal(5);
    });

    it('should allow selector with primitive boolean values', () => {
        const request = new QueryRequest({
            selector: { type: 'veteran', active: true }
        });
        expect(request.selector.active).to.equal(true);
    });

    it('should allow selector with primitive string values', () => {
        const request = new QueryRequest({
            selector: { type: 'veteran', name: 'John' }
        });
        expect(request.selector.name).to.equal('John');
    });
});
