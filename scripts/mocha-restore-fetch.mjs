/**
 * Route tests replace global.fetch with sinon stubs. sinon.restore() does not
 * restore properties assigned directly, so later tests that use real fetch would
 * fail. This hook runs after every test to put native fetch back.
 */
import sinon from 'sinon';

const nativeFetch = globalThis.fetch;

export const mochaHooks = {
    afterEach() {
        sinon.restore();
        const current = globalThis.fetch;
        if (current !== nativeFetch && typeof current?.text !== 'function') {
            globalThis.fetch = nativeFetch;
        }
    }
};
