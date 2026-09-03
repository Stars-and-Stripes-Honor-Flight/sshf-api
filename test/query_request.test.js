import { expect } from 'chai';
import { QueryRequest } from '../models/query_request.js';

describe('QueryRequest', () => {
    describe('constructor and validation', () => {
        it('should use default limit when not provided', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' } });
            expect(request.limit).to.equal(25);
        });

        it('should accept valid query with selector', () => {
            const request = new QueryRequest({
                selector: { type: 'veteran', status: 'Active' },
                limit: 50
            });
            expect(request.selector).to.deep.equal({ type: 'veteran', status: 'Active' });
            expect(request.limit).to.equal(50);
        });

        it('should accept empty selector object', () => {
            const request = new QueryRequest({ selector: {} });
            expect(request.selector).to.deep.equal({});
        });

        it('should throw when selector is missing', () => {
            expect(() => new QueryRequest({})).to.throw('Validation failed: selector is required');
        });

        it('should throw when selector is null', () => {
            expect(() => new QueryRequest({ selector: null })).to.throw('Validation failed: selector must be an object');
        });

        it('should throw when selector is array', () => {
            expect(() => new QueryRequest({ selector: [] })).to.throw('Validation failed: selector must be an object');
        });

        it('should throw when unknown keys are present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                unknown_key: 'value'
            })).to.throw('Validation failed: unknown keys not allowed: unknown_key');
        });

        it('should throw when skip is present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                skip: 10
            })).to.throw('Validation failed: forbidden keys detected: skip');
        });

        it('should throw when mutation key remove is present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                remove: true
            })).to.throw('Validation failed: forbidden keys detected: remove');
        });

        it('should throw when mutation key bulk is present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                bulk: []
            })).to.throw('Validation failed: forbidden keys detected: bulk');
        });

        it('should throw when mutation key docs is present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                docs: []
            })).to.throw('Validation failed: forbidden keys detected: docs');
        });

        it('should throw when mutation key new_edits is present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                new_edits: false
            })).to.throw('Validation failed: forbidden keys detected: new_edits');
        });

        it('should throw when update key is present', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran' },
                update: true
            })).to.throw('Validation failed: forbidden keys detected: update');
        });

        it('should throw when mutation operator is present in selector', () => {
            expect(() => new QueryRequest({
                selector: { type: 'veteran', '$set': { status: 'Active' } }
            })).to.throw('Validation failed: mutation operator not allowed: $set');
        });

        it('should throw when nested mutation operator is present', () => {
            expect(() => new QueryRequest({
                selector: {
                    type: 'veteran',
                    nested: { '$set': { value: 'bad' } }
                }
            })).to.throw('Validation failed: mutation operator not allowed: $set');
        });

        it('should handle deeply nested objects without mutation operators', () => {
            const request = new QueryRequest({
                selector: {
                    type: 'veteran',
                    nested: { deeply: { nested: { value: 'safe' } } }
                }
            });
            expect(request.selector.nested.deeply.nested.value).to.equal('safe');
        });
    });

    describe('normalizeLimit', () => {
        it('should use default limit 25 when omitted', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' } });
            expect(request.limit).to.equal(25);
        });

        it('should respect custom limit within range', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' }, limit: 50 });
            expect(request.limit).to.equal(50);
        });

        it('should clamp limit to 100 when exceeding maximum', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' }, limit: 500 });
            expect(request.limit).to.equal(100);
        });

        it('should clamp limit to 1 when below minimum', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' }, limit: 0 });
            expect(request.limit).to.equal(1);
        });

        it('should clamp negative limit to 1', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' }, limit: -10 });
            expect(request.limit).to.equal(1);
        });
    });

    describe('toRequestBody', () => {
        it('should include selector and limit with default limit', () => {
            const request = new QueryRequest({ selector: { type: 'veteran' } });
            const body = request.toRequestBody();
            expect(body.selector).to.deep.equal({ type: 'veteran' });
            expect(body.limit).to.equal(25);
            expect(body.update).to.equal(false);
        });

        it('should force update to false', () => {
            const request = new QueryRequest({
                selector: { type: 'veteran' },
                limit: 10
            });
            const body = request.toRequestBody();
            expect(body.update).to.equal(false);
        });

        it('should include optional fields when provided', () => {
            const request = new QueryRequest({
                selector: { type: 'veteran' },
                fields: ['_id', 'name'],
                limit: 10
            });
            const body = request.toRequestBody();
            expect(body.fields).to.deep.equal(['_id', 'name']);
        });

        it('should include all fields when provided', () => {
            const request = new QueryRequest({
                selector: { type: 'veteran', status: 'Active' },
                fields: ['_id', 'name', 'status'],
                sort: [{ name: 'asc' }],
                limit: 50,
                bookmark: 'abc123',
                use_index: '_design/my-index',
                execution_stats: true
            });
            const body = request.toRequestBody();
            expect(body.selector).to.deep.equal({ type: 'veteran', status: 'Active' });
            expect(body.fields).to.deep.equal(['_id', 'name', 'status']);
            expect(body.sort).to.deep.equal([{ name: 'asc' }]);
            expect(body.limit).to.equal(50);
            expect(body.bookmark).to.equal('abc123');
            expect(body.use_index).to.equal('_design/my-index');
            expect(body.execution_stats).to.equal(true);
            expect(body.update).to.equal(false);
        });
    });
});
