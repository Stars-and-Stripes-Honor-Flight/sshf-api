import { expect } from 'chai';
import sinon from 'sinon';
import {
    hasServiceAccountJwtConfig,
    shouldPreferServiceAccountJwt,
    shouldFallbackToServiceAccountJwt,
    resolveAuthorizationGroups,
    DirectoryGroupsUnavailableError,
    createDirectoryJwtAuth,
    createDirectoryAdcAuth
} from '../utils/groups.js';
import { assertUserInAllowedGroups, GroupNotAllowedError } from '../utils/auth.js';
import { createAuthenticator } from '../utils/authenticate.js';
import { createMembershipCache } from '../utils/membership_cache.js';

function resolveFresh(userData, groupEmails, options) {
    return resolveAuthorizationGroups(userData, groupEmails, {
        membershipCache: createMembershipCache(),
        ...options
    });
}

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

describe('Directory group lookup does not list every group', () => {
    const userData = { email: 'member@starsandstripeshonorflight.org' };

    it('checks only the configured role group with members.hasMember', async () => {
        const list = sinon.stub().callsFake(() => {
            throw new Error('groups.list should not be called');
        });
        const hasMember = sinon.stub().resolves({ data: { isMember: true } });
        sinon.stub(console, 'log');
        sinon.stub(console, 'error');
        sinon.stub(console, 'warn');

        const result = await resolveFresh(userData, [FULL_ACCESS_GROUP], {
            env: {},
            createAdcAuth: () => ({}),
            createAdmin: () => ({
                groups: { list },
                members: { hasMember }
            })
        });

        expect(list.called).to.be.false;
        expect(hasMember.calledOnce).to.be.true;
        expect(hasMember.firstCall.args[0]).to.deep.equal({
            groupKey: FULL_ACCESS_GROUP,
            memberKey: userData.email
        });
        expect(result.groups).to.deep.equal([{ email: FULL_ACCESS_GROUP }]);
        expect(() => assertUserInAllowedGroups(result.groups, {
            allowedGroupEmails: [FULL_ACCESS_GROUP]
        })).to.not.throw();
        sinon.restore();
    });
});

describe('Directory group lookup failures', () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalAllowedClientIds = process.env.ALLOWED_CLIENT_IDS;
    const originalAllowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
    const originalDevOverride = process.env.AUTHZ_DEV_OVERRIDE_ROLES;
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
            getGroupMemberships: (data) => resolveFresh(data, [FULL_ACCESS_GROUP], {
                env,
                checkMembership: async () => {
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

    beforeEach(() => {
        delete process.env.AUTHZ_DEV_OVERRIDE_ROLES;
    });

    afterEach(() => {
        restore('GOOGLE_CLIENT_ID', originalClientId);
        restore('ALLOWED_CLIENT_IDS', originalAllowedClientIds);
        restore('ALLOWED_EMAIL_DOMAINS', originalAllowedDomains);
        restore('AUTHZ_DEV_OVERRIDE_ROLES', originalDevOverride);
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
            await resolveFresh(userData, [FULL_ACCESS_GROUP], {
                env: { K_SERVICE: 'sshf-api' },
                checkMembership: async () => {
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
        const checkMembership = sinon.stub().rejects(directoryOutage());

        try {
            await resolveFresh(userData, [FULL_ACCESS_GROUP], {
                env: { ...saEnv, K_SERVICE: 'sshf-api' },
                checkMembership,
                createAdcAuth: () => ({}),
                createJwtAuth: () => ({})
            });
            expect.fail('expected Directory group lookup to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
        }

        expect(checkMembership.callCount).to.equal(2);
    });

    it('returns no roles locally when ADC is unusable and no service-account JWT is configured', async () => {
        silenceLogs();

        const result = await resolveFresh(userData, [FULL_ACCESS_GROUP], {
            env: {},
            checkMembership: async () => {
                throw unusableAdcError();
            },
            createAdcAuth: () => ({})
        });

        expect(result.groups).to.deep.equal([]);
    });

    it('returns no roles locally when the JWT and ADC attempts both fail', async () => {
        silenceLogs();
        const checkMembership = sinon.stub().rejects(new Error('Could not load the default credentials'));

        const result = await resolveFresh(userData, [FULL_ACCESS_GROUP], {
            env: saEnv,
            checkMembership,
            createAdcAuth: () => ({}),
            createJwtAuth: () => ({})
        });

        expect(checkMembership.callCount).to.equal(2);
        expect(result.groups).to.deep.equal([]);
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

    it('still rejects local data routes when AUTHZ_ROLE_FULL_GROUPS is set and Directory is unusable', async () => {
        silenceLogs();

        const result = await resolveFresh(userData, [FULL_ACCESS_GROUP], {
            env: { AUTHZ_ROLE_FULL_GROUPS: FULL_ACCESS_GROUP },
            checkMembership: async () => {
                throw unusableAdcError();
            },
            createAdcAuth: () => ({})
        });

        expect(result.groups).to.deep.equal([]);
        expect(() => assertUserInAllowedGroups(result.groups.map((group) => ({ email: group.email })), {
            env: { AUTHZ_ROLE_FULL_GROUPS: FULL_ACCESS_GROUP }
        })).to.throw(GroupNotAllowedError);
    });
});

describe('Directory auth creation functions', () => {
    const saEnv = {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n'
    };

    it('should create JWT auth object with service account credentials', () => {
        const auth = createDirectoryJwtAuth(saEnv);
        
        expect(auth).to.be.an('object');
        expect(auth.email).to.equal('sa@example.iam.gserviceaccount.com');
        expect(auth.key).to.include('BEGIN PRIVATE KEY');
        expect(auth.key).to.not.include('\\n');
        expect(auth.scopes).to.deep.equal(['https://www.googleapis.com/auth/admin.directory.group.readonly']);
    });

    it('should create ADC auth object', () => {
        const auth = createDirectoryAdcAuth();
        
        expect(auth).to.be.an('object');
        expect(auth.scopes).to.deep.equal(['https://www.googleapis.com/auth/admin.directory.group.readonly']);
    });

    it('should create JWT auth with service account credentials via injection', async () => {
        const userData = { email: 'user@starsandstripeshonorflight.org' };

        const mockAuth = {
            authorize: sinon.stub().resolves()
        };
        
        const createJwtAuth = sinon.stub().returns(mockAuth);
        const checkMembership = sinon.stub().resolves({ isMember: false });

        sinon.stub(console, 'log');
        sinon.stub(console, 'error');
        sinon.stub(console, 'warn');

        await resolveFresh(userData, [FULL_ACCESS_GROUP], {
            env: saEnv,
            checkMembership,
            createJwtAuth
        });

        expect(createJwtAuth.calledOnce).to.be.true;
        expect(checkMembership.calledOnce).to.be.true;
        expect(checkMembership.firstCall.args[2]).to.equal(mockAuth);
        sinon.restore();
    });

    it('should create ADC auth when JWT is not preferred', async () => {
        const userData = { email: 'user@starsandstripeshonorflight.org' };
        const emptyEnv = {};

        const mockAuth = {
            authorize: sinon.stub().resolves()
        };
        
        const createAdcAuth = sinon.stub().returns(mockAuth);
        const checkMembership = sinon.stub().resolves({ isMember: false });

        sinon.stub(console, 'log');
        sinon.stub(console, 'error');
        sinon.stub(console, 'warn');

        await resolveFresh(userData, [FULL_ACCESS_GROUP], {
            env: emptyEnv,
            checkMembership,
            createAdcAuth
        });

        expect(createAdcAuth.calledOnce).to.be.true;
        expect(checkMembership.calledOnce).to.be.true;
        expect(checkMembership.firstCall.args[2]).to.equal(mockAuth);

        sinon.restore();
    });
});
