import { expect } from 'chai';
import sinon from 'sinon';
import {
    GROUP_LIST_PAGE_SIZE,
    MAX_GROUP_LIST_PAGES,
    hasServiceAccountJwtConfig,
    shouldPreferServiceAccountJwt,
    shouldFallbackToServiceAccountJwt,
    listGroupsForUser,
    getGroupMemberships,
    DirectoryGroupsUnavailableError
} from '../utils/groups.js';
import { assertUserInAllowedGroups, GroupNotAllowedError } from '../utils/auth.js';
import { createAuthenticator } from '../utils/authenticate.js';

describe('Directory group auth strategy', () => {
    const saEnv = {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n'
    };

    it('detects when JWT service-account env is configured', () => {
        expect(hasServiceAccountJwtConfig(saEnv)).to.equal(true);
        expect(hasServiceAccountJwtConfig({})).to.equal(false);
        expect(hasServiceAccountJwtConfig({
            GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com'
        })).to.equal(false);
    });

    it('prefers JWT locally when a service account is configured', () => {
        expect(shouldPreferServiceAccountJwt(saEnv)).to.equal(true);
    });

    it('does not prefer JWT on Cloud Run (K_SERVICE set)', () => {
        expect(shouldPreferServiceAccountJwt({
            ...saEnv,
            K_SERVICE: 'sshf-api'
        })).to.equal(false);
    });

    it('falls back to JWT for expired ADC reauth errors (invalid_rapt)', () => {
        const error = new Error(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'reauth related error (invalid_rapt)',
            error_subtype: 'invalid_rapt'
        }));
        expect(shouldFallbackToServiceAccountJwt(error, saEnv)).to.equal(true);
    });

    it('falls back to JWT for missing ADC and insufficient scopes', () => {
        expect(shouldFallbackToServiceAccountJwt(
            new Error('Could not load the default credentials'),
            saEnv
        )).to.equal(true);
        expect(shouldFallbackToServiceAccountJwt(
            new Error('Request had insufficient authentication scopes'),
            saEnv
        )).to.equal(true);
    });

    it('does not fall back to JWT when service-account env is missing', () => {
        expect(shouldFallbackToServiceAccountJwt(
            new Error('invalid_rapt'),
            {}
        )).to.equal(false);
    });
});

const FULL_ACCESS_GROUP = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';
const OUR_CLIENT_ID = '111111111111-ourapp.apps.googleusercontent.com';

describe('Directory group paging', () => {
    const userData = { email: 'member@starsandstripeshonorflight.org' };

    it('documents a high page cap above a single groups.list page', () => {
        expect(GROUP_LIST_PAGE_SIZE).to.equal(100);
        expect(MAX_GROUP_LIST_PAGES).to.be.greaterThan(1);
        expect(MAX_GROUP_LIST_PAGES * GROUP_LIST_PAGE_SIZE).to.be.at.least(1000);
    });

    it('honors an allowed group that appears on the second page', async () => {
        const list = sinon.stub();
        list.onCall(0).resolves({
            data: {
                groups: [{ id: '1', name: 'Other', email: 'other@example.com' }],
                nextPageToken: 'page-2'
            }
        });
        list.onCall(1).resolves({
            data: {
                groups: [{ id: '2', name: 'Full Access', email: FULL_ACCESS_GROUP }]
            }
        });

        const groups = await listGroupsForUser(userData, {}, {
            createAdmin: () => ({ groups: { list } })
        });

        expect(list.callCount).to.equal(2);
        expect(list.firstCall.args[0]).to.include({
            userKey: userData.email,
            domain: 'starsandstripeshonorflight.org',
            maxResults: GROUP_LIST_PAGE_SIZE
        });
        expect(list.firstCall.args[0]).to.not.have.property('pageToken');
        expect(list.secondCall.args[0].pageToken).to.equal('page-2');

        const roles = groups.map((group) => ({ email: group.email, id: group.id, name: group.name }));
        expect(roles.map((role) => role.email)).to.include(FULL_ACCESS_GROUP);
        expect(() => assertUserInAllowedGroups(roles, {
            allowedGroupEmails: [FULL_ACCESS_GROUP]
        })).to.not.throw();
    });

    it('stops at the documented page cap when nextPageToken never ends', async () => {
        const list = sinon.stub().resolves({
            data: {
                groups: [{ id: '1', name: 'Other', email: 'other@example.com' }],
                nextPageToken: 'again'
            }
        });

        const groups = await listGroupsForUser(userData, {}, {
            createAdmin: () => ({ groups: { list } }),
            maxPages: 2
        });

        expect(list.callCount).to.equal(2);
        expect(groups).to.have.length(2);
    });
});

describe('Directory group lookup failures', () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalAllowedClientIds = process.env.ALLOWED_CLIENT_IDS;
    const originalAllowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
    const userData = { email: 'member@starsandstripeshonorflight.org' };
    const saEnv = {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n'
    };

    const restore = (key, value) => {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    };

    function directoryOutage() {
        const error = new Error('Directory API unavailable');
        error.response = { status: 503, data: { error: 'backendError' } };
        return error;
    }

    function unusableAdcError() {
        const error = new Error('reauth related error (invalid_rapt)');
        error.response = {
            status: 400,
            data: {
                error: 'invalid_grant',
                error_description: 'reauth related error (invalid_rapt)',
                error_subtype: 'invalid_rapt'
            }
        };
        return error;
    }

    function silenceLogs() {
        sinon.stub(console, 'error');
        sinon.stub(console, 'log');
        sinon.stub(console, 'warn');
    }

    function authenticateWithDirectory(env, directoryError) {
        const cacheSet = sinon.spy();
        const authenticate = createAuthenticator({
            getTokenInfo: async () => ({
                aud: OUR_CLIENT_ID,
                email: userData.email,
                email_verified: true
            }),
            getUserInfo: async () => ({
                sub: 'user-1',
                email: userData.email,
                given_name: 'Mem',
                family_name: 'Ber'
            }),
            getGroupMemberships: (data) => getGroupMemberships(data, {
                env,
                listGroups: async () => {
                    throw directoryError;
                },
                createAdcAuth: () => ({}),
                createJwtAuth: () => ({})
            }),
            cache: {
                get() {
                    return undefined;
                },
                set: cacheSet
            }
        });
        return { authenticate, cacheSet };
    }

    afterEach(() => {
        restore('GOOGLE_CLIENT_ID', originalClientId);
        restore('ALLOWED_CLIENT_IDS', originalAllowedClientIds);
        restore('ALLOWED_EMAIL_DOMAINS', originalAllowedDomains);
        sinon.restore();
    });

    it('returns 503 from authenticate on Cloud Run when the Directory API fails', async () => {
        process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
        delete process.env.ALLOWED_CLIENT_IDS;
        delete process.env.ALLOWED_EMAIL_DOMAINS;
        silenceLogs();

        const { authenticate, cacheSet } = authenticateWithDirectory(
            { K_SERVICE: 'sshf-api' },
            directoryOutage()
        );
        const req = { headers: { authorization: 'Bearer token-1' } };
        const res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        const next = sinon.spy();

        await authenticate(req, res, next);

        expect(res.status.calledOnceWith(503)).to.be.true;
        expect(res.json.calledOnceWith({ message: 'Authentication service unavailable' })).to.be.true;
        expect(next.called).to.be.false;
        expect(req.user).to.equal(undefined);
        expect(cacheSet.called).to.be.false;
    });

    it('throws DirectoryGroupsUnavailableError on Cloud Run instead of returning an empty list', async () => {
        silenceLogs();

        try {
            await getGroupMemberships(userData, {
                env: { K_SERVICE: 'sshf-api' },
                listGroups: async () => {
                    throw directoryOutage();
                },
                createAdcAuth: () => ({})
            });
            expect.fail('expected Directory group lookup to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.equal('Directory API unavailable');
        }
    });

    it('throws on Cloud Run when ADC and the service-account JWT both fail', async () => {
        silenceLogs();
        const listGroups = sinon.stub().rejects(directoryOutage());

        try {
            await getGroupMemberships(userData, {
                env: { ...saEnv, K_SERVICE: 'sshf-api' },
                listGroups,
                createAdcAuth: () => ({}),
                createJwtAuth: () => ({})
            });
            expect.fail('expected Directory group lookup to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
        }

        expect(listGroups.callCount).to.equal(2);
    });

    it('returns no roles locally when ADC is unusable and no service-account JWT is configured', async () => {
        silenceLogs();

        const groups = await getGroupMemberships(userData, {
            env: {},
            listGroups: async () => {
                throw unusableAdcError();
            },
            createAdcAuth: () => ({})
        });

        expect(groups).to.deep.equal([]);
    });

    it('returns no roles locally when the JWT and ADC attempts both fail', async () => {
        silenceLogs();
        const listGroups = sinon.stub().rejects(new Error('Could not load the default credentials'));

        const groups = await getGroupMemberships(userData, {
            env: saEnv,
            listGroups,
            createAdcAuth: () => ({}),
            createJwtAuth: () => ({})
        });

        expect(listGroups.callCount).to.equal(2);
        expect(groups).to.deep.equal([]);
    });

    it('continues authentication locally so a tunneled CouchDB request is not blocked', async () => {
        process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
        delete process.env.ALLOWED_CLIENT_IDS;
        delete process.env.ALLOWED_EMAIL_DOMAINS;
        silenceLogs();

        const { authenticate, cacheSet } = authenticateWithDirectory({}, unusableAdcError());
        const req = { headers: { authorization: 'Bearer token-1' } };
        const res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        const next = sinon.spy();

        await authenticate(req, res, next);

        expect(next.calledOnce).to.be.true;
        expect(res.status.called).to.be.false;
        expect(req.user.roles).to.deep.equal([]);
        expect(req.user.email).to.equal(userData.email);
        expect(cacheSet.calledOnce).to.be.true;
        expect(() => assertUserInAllowedGroups(req.user.roles, { env: {} })).to.not.throw();
    });

    it('still rejects local data routes when ALLOWED_GROUP_EMAILS is set and Directory is unusable', async () => {
        silenceLogs();

        const groups = await getGroupMemberships(userData, {
            env: { ALLOWED_GROUP_EMAILS: FULL_ACCESS_GROUP },
            listGroups: async () => {
                throw unusableAdcError();
            },
            createAdcAuth: () => ({})
        });

        expect(groups).to.deep.equal([]);
        expect(() => assertUserInAllowedGroups(groups.map((group) => ({ email: group.email })), {
            env: { ALLOWED_GROUP_EMAILS: FULL_ACCESS_GROUP }
        })).to.throw(GroupNotAllowedError);
    });
});
