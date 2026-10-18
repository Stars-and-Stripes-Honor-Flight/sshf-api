import { expect } from 'chai';
import { isFlightCompleted } from '../utils/flight_guard.js';

describe('isFlightCompleted', () => {
    it('returns true when completed is boolean true', () => {
        expect(isFlightCompleted({ completed: true })).to.equal(true);
    });

    it('returns true when completed is the legacy string true', () => {
        expect(isFlightCompleted({ completed: 'true' })).to.equal(true);
    });

    it('returns false for an open flight', () => {
        expect(isFlightCompleted({ completed: false })).to.equal(false);
        expect(isFlightCompleted({ completed: 'false' })).to.equal(false);
        expect(isFlightCompleted({})).to.equal(false);
    });

    it('returns false for other stored values', () => {
        expect(isFlightCompleted({ completed: 1 })).to.equal(false);
        expect(isFlightCompleted({ completed: 'True' })).to.equal(false);
        expect(isFlightCompleted({ completed: ' true' })).to.equal(false);
        expect(isFlightCompleted({ completed: null })).to.equal(false);
    });

    it('returns false when there is no flight document', () => {
        expect(isFlightCompleted(null)).to.equal(false);
        expect(isFlightCompleted(undefined)).to.equal(false);
    });
});
