import { expect } from 'chai';
import { authorize } from '../utils/auth.js';

const FULL_ACCESS_GROUP = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';

describe('Auth authorize rethrow', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('rethrows non-GroupNotAllowedError errors', () => {
        process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;
        // Create a req object where roles map will throw TypeError
        const req = { 
            user: { 
                get roles() {
                    throw new TypeError('Cannot read property');
                }
            } 
        };
        const res = {
            status: () => res,
            json: () => res
        };
        
        expect(() => {
            authorize(req, res, () => {});
        }).to.throw(TypeError);
    });
});
