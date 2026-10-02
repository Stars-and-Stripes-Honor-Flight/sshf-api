import { expect } from 'chai';
import sinon from 'sinon';
import { authorize } from '../utils/auth.js';
import { createAuthenticator } from '../utils/authenticate.js';
import {
    HAS_MEMBER_TIMEOUT_MS,
    DirectoryGroupsUnavailableError,
    checkGroupMembership,
    ensureAuthorizationGroupsExist,
    resolveAuthorizationGroups
} from '../utils/groups.js';
import {
    NEGATIVE_MEMBERSHIP_TTL_MS,
    POSITIVE_MEMBERSHIP_TTL_MS,
    createMembershipCache
} from '../utils/membership_cache.js';
import { getHasGroup } from '../routes/user.js';

const FULL_ACCESS_GROUP = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';
const WRITE_ACCESS_GROUP = 'sshf_app_dev_write_access@starsandstripeshonorflight.org';
const NESTED_GROUP = 'sshf_app_dev_nested_test@starsandstripeshonorflight.org';
const OUR_CLIENT_ID = '111111111111-ourapp.apps.googleusercontent.com';
const USER_EMAIL = 'nested.user@starsandstripeshonorflight.org';

const saEnv = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n'
};

function googleError(status, data = { error: 'backendError' }) {
    const error = new Error(`Directory status ${status}`);
    error.response = { status, data };
    return error;
}

function silenceLogs() {
    sinon.stub(console, 'error');
    sinon.stub(console, 'log');
    sinon.stub(console, 'warn');
}

function loggedText(method) {
    return (console[method].args || [])
        .map((args) => args.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '))
        .join('\n');
}

describe('Admin SDK members.hasMember', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('uses a 5 second per-call timeout and the existing directory scope is unchanged', () => {
        expect(HAS_MEMBER_TIMEOUT_MS).to.equal(5000);
    });

    it('returns isMember true for a direct or nested member', async () => {
        const hasMember = sinon.stub().resolves({ data: { isMember: true } });
        const auth = { kind: 'directory' };
        const createAdmin = sinon.stub().returns({ members: { hasMember } });

        const result = await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, auth, {
            createAdmin
        });

        expect(createAdmin.calledOnceWith(auth)).to.be.true;
        expect(hasMember.calledOnce).to.be.true;
        expect(hasMember.firstCall.args[0]).to.deep.equal({
            groupKey: FULL_ACCESS_GROUP,
            memberKey: USER_EMAIL
        });
        expect(hasMember.firstCall.args[1]).to.deep.equal({ timeout: HAS_MEMBER_TIMEOUT_MS });
        expect(result).to.deep.equal({ isMember: true });
    });

    it('returns isMember false when Directory says the user is not a member', async () => {
        const hasMember = sinon.stub().resolves({ data: { isMember: false } });

        const result = await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
            createAdmin: () => ({ members: { hasMember } })
        });

        expect(result).to.deep.equal({ isMember: false });
    });

    it('treats a missing isMember flag as not a member', async () => {
        const hasMember = sinon.stub().resolves({ data: {} });

        const result = await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
            createAdmin: () => ({ members: { hasMember } })
        });

        expect(result).to.deep.equal({ isMember: false });
    });

    it('treats a 404 as not a member and logs the configured group env var without user secrets', async () => {
        silenceLogs();
        const hasMember = sinon.stub().rejects(googleError(404, {
            error: 'notFound',
            access_token: 'ya29.super-secret',
            private_key: 'PRIVATE KEY'
        }));

        const result = await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
            createAdmin: () => ({ members: { hasMember } })
        });

        expect(result).to.deep.equal({ isMember: false });
        const logged = loggedText('error');
        expect(logged).to.include('ALLOWED_GROUP_EMAILS');
        expect(logged).to.include(FULL_ACCESS_GROUP);
        expect(logged).to.not.include(USER_EMAIL);
        expect(logged).to.not.include('ya29.super-secret');
        expect(logged).to.not.include('PRIVATE KEY');
        expect(console.warn.called).to.be.false;
    });

    it('treats a 400 invalid input as not a member and logs a warning without response secrets', async () => {
        silenceLogs();
        const hasMember = sinon.stub().rejects(googleError(400, {
            error: 'invalid',
            message: 'Invalid input',
            access_token: 'ya29.super-secret'
        }));

        const result = await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
            createAdmin: () => ({ members: { hasMember } })
        });

        expect(result).to.deep.equal({ isMember: false });
        const logged = loggedText('warn');
        expect(logged).to.include(FULL_ACCESS_GROUP);
        expect(logged).to.include('400');
        expect(logged).to.not.include('ya29.super-secret');
        expect(console.error.called).to.be.false;
    });

    it('treats HTTP 403 from Google as a Directory outage', async () => {
        const hasMember = sinon.stub().rejects(googleError(403, {
            error: 'insufficientPermissions',
            access_token: 'ya29.super-secret'
        }));

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } })
            });
            expect.fail('expected membership lookup to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.not.include('ya29.super-secret');
            expect(error.message).to.include('403');
        }
    });

    it('treats HTTP 5xx and network failures as a Directory outage', async () => {
        const hasMember = sinon.stub().rejects(googleError(503));

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } })
            });
            expect.fail('expected membership lookup to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.include('503');
        }

        const network = new Error('connect ECONNRESET');
        network.code = 'ECONNRESET';
        hasMember.resetBehavior();
        hasMember.rejects(network);

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } })
            });
            expect.fail('expected network failure to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.include('network');
        }
    });

    it('treats a status on error.status or error.code as the Directory status', async () => {
        const byStatus = new Error('forbidden');
        byStatus.status = 403;
        const byCode = new Error('unavailable');
        byCode.code = 500;
        const hasMember = sinon.stub();
        hasMember.onCall(0).rejects(byStatus);
        hasMember.onCall(1).rejects(byCode);

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } })
            });
            expect.fail('expected status failure to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.include('403');
        }

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } })
            });
            expect.fail('expected code failure to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.include('500');
        }
    });

    it('treats a hung hasMember call as unavailable after the timeout', async () => {
        const hasMember = sinon.stub().returns(new Promise(() => {}));

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } }),
                timeoutMs: 20
            });
            expect.fail('expected timeout');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.include('timeout');
        }
    });

    it('swallows a hasMember rejection that arrives after the timeout', async () => {
        const late = [];
        const onUnhandled = (error) => late.push(error);
        process.on('unhandledRejection', onUnhandled);
        let rejectLate;
        const hasMember = sinon.stub().returns(new Promise((_, reject) => {
            rejectLate = reject;
        }));

        try {
            await checkGroupMembership(USER_EMAIL, FULL_ACCESS_GROUP, {}, {
                createAdmin: () => ({ members: { hasMember } }),
                timeoutMs: 15
            });
            expect.fail('expected timeout');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
            expect(error.message).to.include('timeout');
        }

        rejectLate(new Error('late directory rejection'));
        await new Promise((resolve) => {
            setTimeout(resolve, 30);
        });
        process.off('unhandledRejection', onUnhandled);
        expect(late).to.deep.equal([]);
    });
});

describe('startup Directory group existence', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('reports a missing group instead of treating Directory 404 as a local outage', async () => {
        silenceLogs();
        const groupsGet = sinon.stub().rejects(googleError(404, { access_token: 'ya29.super-secret' }));

        try {
            await ensureAuthorizationGroupsExist(
                [{ email: FULL_ACCESS_GROUP, envVar: 'AUTHZ_ROLE_FULL_GROUPS' }],
                {
                    env: {},
                    createAdcAuth: () => ({ kind: 'adc' }),
                    createAdmin: () => ({ groups: { get: groupsGet } }),
                    sleep: async () => {}
                }
            );
            expect.fail('expected missing group to throw');
        } catch (error) {
            expect(error.code).to.equal('GROUP_NOT_FOUND');
            expect(error.message).to.include('AUTHZ_ROLE_FULL_GROUPS');
            expect(error.message).to.include(FULL_ACCESS_GROUP);
        }
        expect(loggedText('error')).to.not.include('ya29.super-secret');
        expect(groupsGet.calledOnce).to.be.true;
    });
});

describe('resolveAuthorizationGroups', () => {
    const userData = {
        sub: 'user-nested',
        email: USER_EMAIL,
        given_name: 'Nested',
        family_name: 'User'
    };

    let now;
    let membershipCache;

    beforeEach(() => {
        now = 1_000_000;
        membershipCache = createMembershipCache({ now: () => now });
    });

    afterEach(() => {
        sinon.restore();
    });

    function resolve(groupEmails, overrides = {}) {
        return resolveAuthorizationGroups(userData, groupEmails, {
            env: saEnv,
            createJwtAuth: () => ({ kind: 'jwt' }),
            membershipCache,
            now: () => now,
            ...overrides
        });
    }

    it('does not call hasMember when no authorization groups are configured', async () => {
        const listGroups = sinon.stub().resolves([
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);
        const checkMembership = sinon.stub().resolves({ isMember: true });

        const result = await resolve([], {
            env: {},
            listGroups,
            checkMembership,
            createAdcAuth: () => ({ kind: 'adc' })
        });

        expect(checkMembership.called).to.be.false;
        expect(listGroups.calledOnce).to.be.true;
        expect(result.groups).to.deep.equal([
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);
        expect(result.userCacheTtlMs).to.equal(POSITIVE_MEMBERSHIP_TTL_MS);
    });

    it('does not grant membership for a nested group outside the authorization set', async () => {
        const outsider = 'volunteers-leads@starsandstripeshonorflight.org';
        const listGroups = sinon.stub().resolves([
            { id: 'n1', name: 'Volunteers', email: NESTED_GROUP }
        ]);
        const checkMembership = sinon.stub().callsFake((userEmail, groupEmail) => (
            Promise.resolve({ isMember: groupEmail === outsider })
        ));

        const result = await resolve([FULL_ACCESS_GROUP], { listGroups, checkMembership });

        expect(checkMembership.calledOnce).to.be.true;
        expect(checkMembership.firstCall.args[1]).to.equal(FULL_ACCESS_GROUP);
        expect(result.groups.map((group) => group.email)).to.not.include(outsider);
        expect(result.groups).to.deep.equal([
            { id: 'n1', name: 'Volunteers', email: NESTED_GROUP }
        ]);
    });

    it('does not call hasMember for a configured group already in the direct list', async () => {
        const listGroups = sinon.stub().resolves([
            { id: 'f1', name: 'Full access', email: FULL_ACCESS_GROUP.toUpperCase() },
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);
        const checkMembership = sinon.stub().resolves({ isMember: true });

        const result = await resolve([FULL_ACCESS_GROUP], { listGroups, checkMembership });

        expect(checkMembership.called).to.be.false;
        expect(result.userCacheTtlMs).to.equal(POSITIVE_MEMBERSHIP_TTL_MS);
        expect(result.groups).to.deep.equal([
            {
                id: 'f1',
                name: 'Full access',
                email: FULL_ACCESS_GROUP.toUpperCase(),
                membership: 'direct'
            },
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);
    });

    it('adds a nested configured group, passes authorize, and reports hasgroup true', async () => {
        const originalClientId = process.env.GOOGLE_CLIENT_ID;
        const originalAllowedClientIds = process.env.ALLOWED_CLIENT_IDS;
        const originalAllowedGroups = process.env.ALLOWED_GROUP_EMAILS;
        process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
        delete process.env.ALLOWED_CLIENT_IDS;
        process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;

        const listGroups = sinon.stub().resolves([
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);
        const checkMembership = sinon.stub().resolves({ isMember: true });
        const cache = { get: sinon.stub().returns(undefined), set: sinon.spy() };

        try {
            const authenticate = createAuthenticator({
                getTokenInfo: async () => ({
                    aud: OUR_CLIENT_ID,
                    email: USER_EMAIL,
                    email_verified: true
                }),
                getUserInfo: async () => userData,
                getGroupMemberships: (data) => resolve([FULL_ACCESS_GROUP], {
                    listGroups,
                    checkMembership,
                    userData: data
                }),
                cache
            });
            const req = { headers: { authorization: 'Bearer token-nested' } };
            const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const next = sinon.spy();

            await authenticate(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(checkMembership.calledOnce).to.be.true;
            expect(checkMembership.firstCall.args[0]).to.equal(USER_EMAIL);
            expect(checkMembership.firstCall.args[1]).to.equal(FULL_ACCESS_GROUP);
            expect(req.user.roles).to.deep.equal([
                { id: 'n1', name: 'Nested test', email: NESTED_GROUP },
                { email: FULL_ACCESS_GROUP, membership: 'nested' }
            ]);
            expect(cache.set.firstCall.args[2]).to.deep.equal({
                ttlMs: POSITIVE_MEMBERSHIP_TTL_MS
            });

            const gateRes = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const gateNext = sinon.spy();
            authorize(req, gateRes, gateNext);
            expect(gateNext.calledOnce).to.be.true;
            expect(gateRes.status.called).to.be.false;

            const probeRes = { body: null, json(payload) { this.body = payload; return this; } };
            getHasGroup({ user: req.user, query: { groupEmail: FULL_ACCESS_GROUP.toUpperCase() } }, probeRes);
            expect(probeRes.body).to.deep.equal({ hasgroup: true });
        } finally {
            restoreEnv('GOOGLE_CLIENT_ID', originalClientId);
            restoreEnv('ALLOWED_CLIENT_IDS', originalAllowedClientIds);
            restoreEnv('ALLOWED_GROUP_EMAILS', originalAllowedGroups);
        }
    });

    it('fail-closes a non-member with a short user-cache TTL', async () => {
        const originalAllowedGroups = process.env.ALLOWED_GROUP_EMAILS;
        process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;
        const listGroups = sinon.stub().resolves([
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);
        const checkMembership = sinon.stub().resolves({ isMember: false });

        try {
            const result = await resolve([FULL_ACCESS_GROUP], { listGroups, checkMembership });

            expect(result.groups).to.deep.equal([
                { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
            ]);
            expect(result.userCacheTtlMs).to.equal(NEGATIVE_MEMBERSHIP_TTL_MS);

            const req = { user: { roles: result.groups } };
            const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const next = sinon.spy();
            authorize(req, res, next);
            expect(res.status.calledOnceWith(403)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Forbidden: Account not permitted' })).to.be.true;
            expect(next.called).to.be.false;

            const probeRes = { body: null, json(payload) { this.body = payload; return this; } };
            getHasGroup({
                user: { roles: result.groups },
                query: { groupEmail: FULL_ACCESS_GROUP }
            }, probeRes);
            expect(probeRes.body).to.deep.equal({ hasgroup: false });
        } finally {
            restoreEnv('ALLOWED_GROUP_EMAILS', originalAllowedGroups);
        }
    });

    it('checks configured groups in parallel and passes when any group matches', async () => {
        const releases = [];
        let inFlight = 0;
        let maxInFlight = 0;
        const listGroups = sinon.stub().resolves([]);
        const checkMembership = sinon.stub().callsFake((userEmail, groupEmail) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise((resolveMembership) => {
                releases.push(() => {
                    inFlight -= 1;
                    resolveMembership({ isMember: groupEmail === WRITE_ACCESS_GROUP });
                });
            });
        });

        const pending = resolve(
            [FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP, FULL_ACCESS_GROUP.toUpperCase()],
            { listGroups, checkMembership }
        );
        await waitUntil(() => checkMembership.callCount === 2);
        expect(maxInFlight).to.equal(2);
        releases.forEach((release) => release());

        const result = await pending;
        expect(result.groups).to.deep.equal([
            { email: WRITE_ACCESS_GROUP, membership: 'nested' }
        ]);
        expect(result.userCacheTtlMs).to.equal(NEGATIVE_MEMBERSHIP_TTL_MS);
        expect(checkMembership.getCalls().map((call) => call.args[1])).to.deep.equal([
            FULL_ACCESS_GROUP,
            WRITE_ACCESS_GROUP
        ]);
    });

    it('compares configured group emails case-insensitively when calling hasMember', async () => {
        const listGroups = sinon.stub().resolves([]);
        const checkMembership = sinon.stub().resolves({ isMember: true });

        const result = await resolve([`  ${FULL_ACCESS_GROUP.toUpperCase()}  `], {
            listGroups,
            checkMembership
        });

        expect(checkMembership.firstCall.args[1]).to.equal(FULL_ACCESS_GROUP);
        expect(result.groups[0]).to.deep.equal({
            email: FULL_ACCESS_GROUP,
            membership: 'nested'
        });
    });

    it('reuses a positive membership and rechecks only an expired negative membership', async () => {
        const listGroups = sinon.stub().resolves([]);
        const checkMembership = sinon.stub();
        checkMembership.onCall(0).resolves({ isMember: true });
        checkMembership.onCall(1).resolves({ isMember: false });
        checkMembership.onCall(2).resolves({ isMember: true });

        const first = await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
            listGroups,
            checkMembership
        });
        expect(first.userCacheTtlMs).to.equal(NEGATIVE_MEMBERSHIP_TTL_MS);
        expect(checkMembership.callCount).to.equal(2);

        now += NEGATIVE_MEMBERSHIP_TTL_MS - 1;
        const withinNegative = await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
            listGroups,
            checkMembership
        });
        expect(checkMembership.callCount).to.equal(2);
        expect(withinNegative.groups.map((group) => group.email)).to.deep.equal([FULL_ACCESS_GROUP]);
        expect(withinNegative.userCacheTtlMs).to.equal(1);

        now += 1;
        const afterNegative = await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
            listGroups,
            checkMembership
        });
        expect(checkMembership.callCount).to.equal(3);
        expect(checkMembership.thirdCall.args[1]).to.equal(WRITE_ACCESS_GROUP);
        expect(afterNegative.groups.map((group) => group.email)).to.deep.equal([
            FULL_ACCESS_GROUP,
            WRITE_ACCESS_GROUP
        ]);
        expect(afterNegative.userCacheTtlMs).to.equal(
            POSITIVE_MEMBERSHIP_TTL_MS - NEGATIVE_MEMBERSHIP_TTL_MS
        );
    });

    it('does not cache Directory errors and calls hasMember again on the next lookup', async () => {
        silenceLogs();
        const listGroups = sinon.stub().resolves([
            { id: 'f1', name: 'Full access', email: FULL_ACCESS_GROUP }
        ]);
        const checkMembership = sinon.stub();
        checkMembership.onCall(0).rejects(googleError(503));
        checkMembership.onCall(1).resolves({ isMember: true });

        try {
            await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
                env: { K_SERVICE: 'sshf-api' },
                listGroups,
                checkMembership,
                createAdcAuth: () => ({ kind: 'adc' })
            });
            expect.fail('expected Directory outage to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
        }
        expect(membershipCache.size()).to.equal(0);

        const retried = await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
            env: { K_SERVICE: 'sshf-api' },
            listGroups,
            checkMembership,
            createAdcAuth: () => ({ kind: 'adc' })
        });
        expect(checkMembership.callCount).to.equal(2);
        expect(retried.groups.map((group) => group.email)).to.include(WRITE_ACCESS_GROUP);
        expect(membershipCache.get(USER_EMAIL, FULL_ACCESS_GROUP).isMember).to.equal(true);
        expect(membershipCache.get(USER_EMAIL, WRITE_ACCESS_GROUP).isMember).to.equal(true);
    });

    it('returns empty roles locally and throws on Cloud Run when hasMember returns 5xx, without logging response secrets', async () => {
        silenceLogs();
        const hasMember = sinon.stub().rejects(googleError(503, {
            access_token: 'ya29.super-secret'
        }));
        const listGroups = sinon.stub().resolves([
            { id: 'n1', name: 'Nested test', email: NESTED_GROUP }
        ]);

        try {
            await resolve([FULL_ACCESS_GROUP], {
                env: { K_SERVICE: 'sshf-api' },
                listGroups,
                createAdcAuth: () => ({ kind: 'adc' }),
                createAdmin: () => ({ members: { hasMember } })
            });
            expect.fail('expected Cloud Run lookup to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
        }
        expect(loggedText('error')).to.not.include('ya29.super-secret');
        expect(membershipCache.size()).to.equal(0);

        const local = await resolve([FULL_ACCESS_GROUP], {
            env: {},
            listGroups,
            createAdcAuth: () => ({ kind: 'adc' }),
            createAdmin: () => ({ members: { hasMember } })
        });
        expect(local.groups).to.deep.equal([]);
        expect(loggedText('error')).to.not.include('ya29.super-secret');
        expect(membershipCache.size()).to.equal(0);
    });

    it('fails the whole lookup when one group succeeds and another returns 5xx', async () => {
        silenceLogs();
        const listGroups = sinon.stub().resolves([]);
        const checkMembership = sinon.stub().callsFake((userEmail, groupEmail) => {
            if (groupEmail === WRITE_ACCESS_GROUP) {
                return Promise.reject(googleError(500));
            }
            return Promise.resolve({ isMember: true });
        });

        try {
            await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
                env: { K_SERVICE: 'sshf-api' },
                listGroups,
                checkMembership,
                createAdcAuth: () => ({ kind: 'adc' })
            });
            expect.fail('expected mixed failure to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(DirectoryGroupsUnavailableError);
        }

        expect(membershipCache.get(USER_EMAIL, FULL_ACCESS_GROUP)).to.equal(undefined);
        expect(membershipCache.get(USER_EMAIL, WRITE_ACCESS_GROUP)).to.equal(undefined);

        const local = await resolve([FULL_ACCESS_GROUP, WRITE_ACCESS_GROUP], {
            env: {},
            listGroups,
            checkMembership,
            createAdcAuth: () => ({ kind: 'adc' })
        });
        expect(local.groups).to.deep.equal([]);
        expect(membershipCache.size()).to.equal(0);
    });

    it('treats a 404 from hasMember as not a member of that configured group', async () => {
        silenceLogs();
        const hasMember = sinon.stub().rejects(googleError(404, { access_token: 'ya29.super-secret' }));
        const listGroups = sinon.stub().resolves([]);

        const result = await resolve([FULL_ACCESS_GROUP], {
            listGroups,
            createAdmin: () => ({ members: { hasMember } })
        });

        expect(hasMember.calledOnce).to.be.true;
        expect(result.groups).to.deep.equal([]);
        expect(result.userCacheTtlMs).to.equal(NEGATIVE_MEMBERSHIP_TTL_MS);
        const logged = loggedText('error');
        expect(logged).to.include('ALLOWED_GROUP_EMAILS');
        expect(logged).to.include(FULL_ACCESS_GROUP);
        expect(logged).to.not.include(USER_EMAIL);
        expect(logged).to.not.include('ya29.super-secret');
        expect(membershipCache.get(USER_EMAIL, FULL_ACCESS_GROUP).isMember).to.equal(false);
    });

    it('falls back from JWT to ADC and still honors a nested member', async () => {
        const listGroups = sinon.stub();
        listGroups.onCall(0).rejects(new Error('JWT directory failed'));
        listGroups.onCall(1).resolves([]);
        const checkMembership = sinon.stub().resolves({ isMember: true });
        silenceLogs();

        const result = await resolve([FULL_ACCESS_GROUP], {
            listGroups,
            checkMembership,
            createJwtAuth: () => ({ kind: 'jwt' }),
            createAdcAuth: () => ({ kind: 'adc' })
        });

        expect(listGroups.callCount).to.equal(2);
        expect(checkMembership.calledOnce).to.be.true;
        expect(checkMembership.firstCall.args[2]).to.deep.equal({ kind: 'adc' });
        expect(result.groups).to.deep.equal([
            { email: FULL_ACCESS_GROUP, membership: 'nested' }
        ]);
    });

    it('uses the shared membership cache when the caller does not inject one', async () => {
        const listGroups = sinon.stub().resolves([]);
        const checkMembership = sinon.stub().resolves({ isMember: false });
        const isolatedUser = {
            email: 'cache-default@starsandstripeshonorflight.org'
        };

        await resolveAuthorizationGroups(isolatedUser, [FULL_ACCESS_GROUP], {
            env: saEnv,
            listGroups,
            checkMembership,
            createJwtAuth: () => ({})
        });
        await resolveAuthorizationGroups(isolatedUser, [FULL_ACCESS_GROUP], {
            env: saEnv,
            listGroups,
            checkMembership,
            createJwtAuth: () => ({})
        });

        expect(checkMembership.callCount).to.equal(1);
    });
});

function restoreEnv(key, value) {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}

async function waitUntil(predicate) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 5);
        });
    }
    throw new Error('timed out waiting for condition');
}
