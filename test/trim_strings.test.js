import { expect } from 'chai';
import { trimStringValues, trimIfString } from '../utils/trim_strings.js';

describe('trim_strings utilities', () => {
    describe('trimIfString', () => {
        it('should trim leading and trailing whitespace from strings', () => {
            expect(trimIfString('  hello  ')).to.equal('hello');
        });

        it('should return non-string values unchanged', () => {
            expect(trimIfString(true)).to.equal(true);
            expect(trimIfString(42)).to.equal(42);
            expect(trimIfString(null)).to.equal(null);
        });
    });

    describe('trimStringValues', () => {
        it('should trim nested string fields', () => {
            const input = {
                name: { first: '  John  ', last: ' Smith ' },
                address: { city: ' Springfield ' }
            };
            const result = trimStringValues(input);
            expect(result.name.first).to.equal('John');
            expect(result.name.last).to.equal('Smith');
            expect(result.address.city).to.equal('Springfield');
        });

        it('should preserve internal spaces in strings', () => {
            const input = { name: { first: '  Mary Ann  ' } };
            const result = trimStringValues(input);
            expect(result.name.first).to.equal('Mary Ann');
        });

        it('should not modify non-string values', () => {
            const input = {
                completed: true,
                capacity: 100,
                count: 0
            };
            const result = trimStringValues(input);
            expect(result.completed).to.equal(true);
            expect(result.capacity).to.equal(100);
            expect(result.count).to.equal(0);
        });

        it('should skip history arrays and their contents', () => {
            const input = {
                name: { first: '  John  ' },
                flight: {
                    history: [
                        { id: '2024-01-01', change: '  changed seat from: 1A  to: 2B  ' }
                    ]
                }
            };
            const result = trimStringValues(input);
            expect(result.name.first).to.equal('John');
            expect(result.flight.history[0].change).to.equal('  changed seat from: 1A  to: 2B  ');
        });

        it('should skip top-level history arrays', () => {
            const history = [{ change: '  audit entry  ' }];
            const input = {
                name: '  test  ',
                history
            };
            const result = trimStringValues(input);
            expect(result.name).to.equal('test');
            expect(result.history).to.equal(history);
            expect(result.history[0].change).to.equal('  audit entry  ');
        });

        it('should skip arrays passed with a history parent key', () => {
            const history = [{ change: '  audit entry  ' }];
            const result = trimStringValues(history, 'history');
            expect(result).to.equal(history);
            expect(result[0].change).to.equal('  audit entry  ');
        });

        it('should return primitives unchanged', () => {
            expect(trimStringValues(null)).to.equal(null);
            expect(trimStringValues(undefined)).to.equal(undefined);
            expect(trimStringValues('  hi  ')).to.equal('hi');
        });

        it('should not mutate the original object', () => {
            const input = { name: { first: '  John  ' } };
            const result = trimStringValues(input);
            expect(input.name.first).to.equal('  John  ');
            expect(result.name.first).to.equal('John');
        });

        it('should handle empty and whitespace-only strings', () => {
            const input = { name: { first: '   ', last: '' } };
            const result = trimStringValues(input);
            expect(result.name.first).to.equal('');
            expect(result.name.last).to.equal('');
        });
    });
});
