import { expect } from 'chai';
import { getHasGroup } from '../routes/user.js';

const FULL_ACCESS_GROUP = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';

describe('getHasGroup', () => {
    const createRes = () => {
        const res = {
            body: null,
            json(payload) {
                this.body = payload;
                return this;
            }
        };
        return res;
    };

    it('returns hasgroup true when the user is in the requested group', () => {
        const req = {
            user: { roles: [{ email: FULL_ACCESS_GROUP }] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: true });
    });

    it('returns hasgroup false when the user is not in the requested group', () => {
        const req = {
            user: { roles: [{ email: 'other@example.com' }] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: false });
    });

    it('returns hasgroup false when the user has no roles (probe still works)', () => {
        const req = {
            user: { roles: [] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: false });
    });
});
