import { expect } from 'chai';
import sinon from 'sinon';
import { authorize } from '../utils/auth.js';
import { createAuthenticator } from '../utils/authenticate.js';
import {
    GROUP_EXISTENCE_ATTEMPTS,
    GROUP_EXISTENCE_BACKOFF_MS,
    ROLE_IDS,
    ROLE_PERMISSIONS,
    cloudRunAuthorizationProblems,
    confirmConfiguredGroupsExist,
    describeRoleConfig,
    getFullAccessGroupEmails,
    listConfiguredGroupEntries,
    permissionsForRoles,
    resolveAccessFromMemberships,
    startupWarnings
} from '../utils/permissions.js';
import { validateGroupAuthorization } from '../index.js';

const DOMAIN = 'starsandstripeshonorflight.org';
const READ = `sshf_app_dev_read_access@${DOMAIN}`;
const WRITE = `sshf_app_dev_write_access@${DOMAIN}`;
const FULL = `sshf_app_dev_full_access@${DOMAIN}`;
const MEDICAL = `sshf_app_dev_medical_access@${DOMAIN}`;
const REVIEW = `sshf_app_dev_review_access@${DOMAIN}`;
const OTHER = `some-other-group@${DOMAIN}`;

function roleEnv(overrides = {}) {
    return {
        AUTHZ_ROLE_READ_GROUPS: READ,
        AUTHZ_ROLE_WRITE_GROUPS: WRITE,
        AUTHZ_ROLE_FULL_GROUPS: FULL,
        AUTHZ_ROLE_MEDICAL_GROUPS: MEDICAL,
        AUTHZ_ROLE_REVIEW_GROUPS: REVIEW,
        ...overrides
    };
}

describe('Phase 2 role groups and permissions', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        sinon.restore();
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        for (const [key, value] of Object.entries(originalEnv)) {
            process.env[key] = value;
        }
    });

    describe('permission catalog and inheritance', () => {
        it('defines the five stable role ids', () => {
            expect(ROLE_IDS).to.deep.equal(['READ', 'WRITE', 'FULL', 'MEDICAL', 'REVIEW']);
        });

        it('gives WRITE every READ permission and FULL every WRITE permission', () => {
            const read = new Set(ROLE_PERMISSIONS.READ);
            const write = new Set(ROLE_PERMISSIONS.WRITE);
            const full = new Set(ROLE_PERMISSIONS.FULL);
            for (const permission of read) {
                expect(write.has(permission), permission).to.equal(true);
                expect(full.has(permission), permission).to.equal(true);
            }
            for (const permission of write) {
                expect(full.has(permission), permission).to.equal(true);
            }
            expect(write.has('records:write')).to.equal(true);
            expect(full.has('records:delete')).to.equal(true);
            expect(full.has('documents:admin')).to.equal(true);
            expect(full.has('flights:manage')).to.equal(true);
        });

        it('keeps MEDICAL and REVIEW out of FULL', () => {
            const full = new Set(ROLE_PERMISSIONS.FULL);
            for (const permission of [...ROLE_PERMISSIONS.MEDICAL, ...ROLE_PERMISSIONS.REVIEW]) {
                expect(full.has(permission), permission).to.equal(false);
            }
            expect(ROLE_PERMISSIONS.MEDICAL).to.deep.equal(['medical:read', 'medical:write']);
            expect(ROLE_PERMISSIONS.REVIEW).to.deep.equal([
                'applications:accept',
                'applications:review'
            ]);
            expect(new Set(ROLE_PERMISSIONS.MEDICAL).has('records:read')).to.equal(false);
            expect(new Set(ROLE_PERMISSIONS.REVIEW).has('records:read')).to.equal(false);
        });

        it('unions permissions across direct roles and sorts them', () => {
            expect(permissionsForRoles(['FULL', 'REVIEW'])).to.deep.equal([
                ...ROLE_PERMISSIONS.FULL,
                ...ROLE_PERMISSIONS.REVIEW
            ].sort());
            expect(permissionsForRoles(['WRITE'])).to.deep.equal([...ROLE_PERMISSIONS.WRITE].sort());
        });
    });

    describe('env parsing', () => {
        it('lowercases, trims, and dedupes group emails', () => {
            const described = describeRoleConfig(roleEnv({
                AUTHZ_ROLE_READ_GROUPS: ` ${READ.toUpperCase()} , ${READ} , ${WRITE} `
            }));
            expect(described.groupsByRole.READ).to.deep.equal([READ, WRITE]);
        });

        it('ignores ALLOWED_GROUP_EMAILS and reads FULL only from AUTHZ_ROLE_FULL_GROUPS', () => {
            const env = roleEnv({ AUTHZ_ROLE_FULL_GROUPS: '  ,  ' });
            delete env.AUTHZ_ROLE_FULL_GROUPS;
            env.ALLOWED_GROUP_EMAILS = ` ${FULL.toUpperCase()} `;
            const described = describeRoleConfig(env);
            expect(described).to.not.have.property('aliasUsed');
            expect(described).to.not.have.property('aliasDiffers');
            expect(described.groupsByRole.FULL).to.deep.equal([]);
            expect(getFullAccessGroupEmails(env)).to.deep.equal([]);
            expect(startupWarnings(env).join('\n')).to.not.match(/ALLOWED_GROUP_EMAILS/);
            expect(listConfiguredGroupEntries(env).map((entry) => entry.email)).to.not.include(FULL);
        });

        it('does not warn when a leftover ALLOWED_GROUP_EMAILS matches AUTHZ_ROLE_FULL_GROUPS', () => {
            const env = roleEnv({
                AUTHZ_ROLE_FULL_GROUPS: FULL.toUpperCase(),
                ALLOWED_GROUP_EMAILS: FULL
            });
            const described = describeRoleConfig(env);
            expect(described.groupsByRole.FULL).to.deep.equal([FULL]);
            expect(startupWarnings(env)).to.deep.equal([]);
            expect(getFullAccessGroupEmails(env)).to.deep.equal([FULL]);
        });

        it('treats an unknown AUTHZ_ROLE_*_GROUPS variable as a Cloud Run startup failure', () => {
            const env = roleEnv({
                K_SERVICE: 'sshf-api',
                AUTHZ_ROLE_ADMIN_GROUPS: OTHER
            });
            const problems = cloudRunAuthorizationProblems(env);
            expect(problems.join('\n')).to.include('AUTHZ_ROLE_ADMIN_GROUPS');
            expect(describeRoleConfig(env).groupsByRole.FULL).to.deep.equal([FULL]);
        });

        it('rejects a malformed group email on Cloud Run and skips it in the parsed set', () => {
            const env = roleEnv({
                K_SERVICE: 'sshf-api',
                AUTHZ_ROLE_READ_GROUPS: `not-an-email, ${READ}`
            });
            const problems = cloudRunAuthorizationProblems(env);
            expect(problems.join('\n')).to.include('AUTHZ_ROLE_READ_GROUPS');
            expect(problems.join('\n')).to.include('not-an-email');
            expect(describeRoleConfig(env).groupsByRole.READ).to.deep.equal([READ]);
        });

        it('requires AUTHZ_ROLE_FULL_GROUPS on Cloud Run and does not accept the removed alias', () => {
            const env = { K_SERVICE: 'sshf-api', AUTHZ_ROLE_READ_GROUPS: READ };
            const problems = cloudRunAuthorizationProblems(env).join('\n');
            expect(problems).to.match(/AUTHZ_ROLE_FULL_GROUPS/);
            expect(problems).to.not.match(/ALLOWED_GROUP_EMAILS/);
            const aliasOnly = cloudRunAuthorizationProblems({
                K_SERVICE: 'sshf-api',
                ALLOWED_GROUP_EMAILS: FULL
            }).join('\n');
            expect(aliasOnly).to.match(/AUTHZ_ROLE_FULL_GROUPS/);
            expect(aliasOnly).to.not.match(/deprecated alias/i);
        });

        it('warns locally for an unknown role or malformed email and does not require FULL', () => {
            const env = {
                AUTHZ_ROLE_ADMIN_GROUPS: OTHER,
                AUTHZ_ROLE_READ_GROUPS: 'not-an-email'
            };
            expect(cloudRunAuthorizationProblems(env)).to.deep.equal([]);
            const warnings = startupWarnings(env).join('\n');
            expect(warnings).to.include('AUTHZ_ROLE_ADMIN_GROUPS');
            expect(warnings).to.include('not-an-email');
            expect(warnings).to.not.match(/must be set/);
        });

        it('lists each configured group once and names every env var that maps it', () => {
            const env = roleEnv({
                AUTHZ_ROLE_READ_GROUPS: FULL,
                AUTHZ_ROLE_WRITE_GROUPS: WRITE
            });
            const entries = listConfiguredGroupEntries(env);
            const fullEntry = entries.find((entry) => entry.email === FULL);
            expect(fullEntry.envVar).to.include('AUTHZ_ROLE_READ_GROUPS');
            expect(fullEntry.envVar).to.include('AUTHZ_ROLE_FULL_GROUPS');
            expect(entries.map((entry) => entry.email)).to.include(WRITE);
            expect(entries.filter((entry) => entry.email === FULL)).to.have.lengthOf(1);
        });

        it('does not treat ALLOWED_GROUP_EMAILS as a configured role group', () => {
            expect(listConfiguredGroupEntries({
                ALLOWED_GROUP_EMAILS: FULL
            })).to.deep.equal([]);
        });
    });

    describe('role resolution', () => {
        const env = roleEnv();

        it('grants only the direct roles and the inherited permission union', () => {
            const writeOnly = resolveAccessFromMemberships([
                { email: WRITE, membership: 'nested' }
            ], env);
            expect(writeOnly.roles).to.deep.equal(['WRITE']);
            expect(writeOnly.permissions).to.deep.equal([...ROLE_PERMISSIONS.WRITE].sort());
            expect(writeOnly.permissions).to.include('records:read');
            expect(writeOnly.permissions).to.not.include('records:delete');

            const fullOnly = resolveAccessFromMemberships([{ email: FULL }], env);
            expect(fullOnly.roles).to.deep.equal(['FULL']);
            expect(fullOnly.permissions).to.not.include('medical:read');
            expect(fullOnly.permissions).to.not.include('applications:review');

            const fullAndReview = resolveAccessFromMemberships([
                { email: FULL.toUpperCase() },
                { email: REVIEW },
                { email: MEDICAL }
            ], env);
            expect(fullAndReview.roles).to.deep.equal(['FULL', 'MEDICAL', 'REVIEW']);
            expect(fullAndReview.permissions).to.include('records:delete');
            expect(fullAndReview.permissions).to.include('medical:write');
            expect(fullAndReview.permissions).to.include('applications:accept');
        });

        it('does not grant a role for a group outside the configured role groups', () => {
            const access = resolveAccessFromMemberships([
                { email: OTHER, membership: 'direct' },
                { email: 'volunteers-leads@starsandstripeshonorflight.org', membership: 'nested' }
            ], env);
            expect(access.roles).to.deep.equal([]);
            expect(access.permissions).to.deep.equal([]);
        });

        it('grants every role whose group matches, without inventing inherited role ids', () => {
            const access = resolveAccessFromMemberships([
                { email: READ },
                { email: WRITE }
            ], env);
            expect(access.roles).to.deep.equal(['READ', 'WRITE']);
        });
    });

    describe('authorize FULL helper', () => {
        function runAuthorize(roles) {
            const req = { user: { roles } };
            const res = {
                statusCode: null,
                body: null,
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                json(payload) {
                    this.body = payload;
                    return this;
                }
            };
            let nextCalled = false;
            authorize(req, res, () => {
                nextCalled = true;
            });
            return { res, nextCalled };
        }

        it('still admits only FULL membership', () => {
            delete process.env.K_SERVICE;
            delete process.env.ALLOWED_GROUP_EMAILS;
            Object.assign(process.env, roleEnv());

            expect(runAuthorize([{ email: FULL, membership: 'nested' }]).nextCalled).to.equal(true);
            for (const email of [READ, WRITE, MEDICAL, REVIEW, OTHER]) {
                const result = runAuthorize([{ email }]);
                expect(result.nextCalled, email).to.equal(false);
                expect(result.res.statusCode, email).to.equal(403);
                expect(result.res.body).to.deep.equal({ message: 'Forbidden: Account not permitted' });
            }
        });

        it('does not treat ALLOWED_GROUP_EMAILS as the FULL gate', () => {
            delete process.env.K_SERVICE;
            process.env.AUTHZ_ROLE_FULL_GROUPS = FULL;
            process.env.ALLOWED_GROUP_EMAILS = OTHER;
            expect(runAuthorize([{ email: FULL }]).nextCalled).to.equal(true);
            const other = runAuthorize([{ email: OTHER }]);
            expect(other.nextCalled).to.equal(false);
            expect(other.res.statusCode).to.equal(403);
        });
    });

    describe('authenticate attaches roles and permissions once', () => {
        it('stores direct role ids and permissions beside the group memberships', async () => {
            delete process.env.K_SERVICE;
            delete process.env.ALLOWED_GROUP_EMAILS;
            Object.assign(process.env, roleEnv());
            process.env.GOOGLE_CLIENT_ID = '111111111111-ourapp.apps.googleusercontent.com';
            delete process.env.ALLOWED_CLIENT_IDS;
            delete process.env.ALLOWED_EMAIL_DOMAINS;

            const groups = [
                { email: WRITE, membership: 'nested' },
                { email: REVIEW, membership: 'direct' }
            ];
            const cache = { get: sinon.stub().returns(undefined), set: sinon.spy() };
            const authenticate = createAuthenticator({
                getTokenInfo: async () => ({
                    aud: process.env.GOOGLE_CLIENT_ID,
                    email: 'user@starsandstripeshonorflight.org',
                    email_verified: true
                }),
                getUserInfo: async () => ({
                    sub: 'user-123',
                    email: 'user@starsandstripeshonorflight.org',
                    given_name: 'Test',
                    family_name: 'User',
                    picture: 'https://example.com/avatar.jpg'
                }),
                getGroupMemberships: async () => ({ groups, userCacheTtlMs: 120000 }),
                cache
            });
            const req = { headers: { authorization: 'Bearer token' } };
            const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const next = sinon.spy();
            await authenticate(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.user.roles).to.deep.equal(groups);
            expect(req.user.authorizationRoles).to.deep.equal(['REVIEW', 'WRITE']);
            expect(req.user.permissions).to.deep.equal(
                [...new Set([...ROLE_PERMISSIONS.WRITE, ...ROLE_PERMISSIONS.REVIEW])].sort()
            );
            expect(cache.set.firstCall.args[1].authorizationRoles).to.deep.equal(['REVIEW', 'WRITE']);
            expect(req.user.evaluatedAt).to.match(/^\d{4}-\d{2}-\d{2}T/);
            expect(Date.parse(req.user.expiresAt) - Date.parse(req.user.evaluatedAt)).to.equal(120000);
            expect(cache.set.firstCall.args[1].evaluatedAt).to.equal(req.user.evaluatedAt);

            const gate = runGate(req);
            expect(gate.nextCalled).to.equal(false);
            expect(gate.res.statusCode).to.equal(403);
        });
    });

    describe('startup group existence checks', () => {
        it('uses three attempts and about fifteen seconds of backoff', () => {
            expect(GROUP_EXISTENCE_ATTEMPTS).to.equal(3);
            expect(GROUP_EXISTENCE_BACKOFF_MS).to.deep.equal([4000, 8000]);
        });

        it('stops on 404 without retrying and names the env var', async () => {
            const sleep = sinon.stub().resolves();
            const getGroup = sinon.stub().rejects(Object.assign(new Error('missing'), { status: 404 }));
            try {
                await confirmConfiguredGroupsExist([
                    { email: READ, envVar: 'AUTHZ_ROLE_READ_GROUPS' }
                ], { getGroup, sleep });
                expect.fail('expected missing group to throw');
            } catch (error) {
                expect(error.message).to.include('AUTHZ_ROLE_READ_GROUPS');
                expect(error.message).to.include(READ);
                expect(error.status).to.equal(404);
            }
            expect(getGroup.calledOnce).to.be.true;
            expect(sleep.called).to.be.false;
        });

        it('retries a Directory outage and then fails', async () => {
            const sleep = sinon.stub().resolves();
            const getGroup = sinon.stub().rejects(Object.assign(new Error('unavailable'), { status: 503 }));
            try {
                await confirmConfiguredGroupsExist([
                    { email: FULL, envVar: 'AUTHZ_ROLE_FULL_GROUPS' }
                ], { getGroup, sleep });
                expect.fail('expected outage to throw');
            } catch (error) {
                expect(error.message).to.match(/3 attempts/);
                expect(error.message).to.include('503');
                expect(error.message).to.not.include('ya29');
            }
            expect(getGroup.callCount).to.equal(3);
            expect(sleep.getCall(0).args[0]).to.equal(4000);
            expect(sleep.getCall(1).args[0]).to.equal(8000);
        });

        it('checks configured groups in parallel', async () => {
            const sleep = sinon.stub().resolves();
            let inFlight = 0;
            let maxInFlight = 0;
            const getGroup = sinon.stub().callsFake(async () => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((resolve) => {
                    setImmediate(resolve);
                });
                inFlight -= 1;
                return { email: 'ok' };
            });
            await confirmConfiguredGroupsExist([
                { email: READ, envVar: 'AUTHZ_ROLE_READ_GROUPS' },
                { email: WRITE, envVar: 'AUTHZ_ROLE_WRITE_GROUPS' }
            ], { getGroup, sleep });
            expect(maxInFlight).to.equal(2);
            expect(sleep.called).to.be.false;
        });

        it('accepts a group that exists on a later attempt', async () => {
            const sleep = sinon.stub().resolves();
            const getGroup = sinon.stub();
            getGroup.onCall(0).rejects(Object.assign(new Error('unavailable'), { status: 503 }));
            getGroup.onCall(1).resolves({ email: FULL });
            await confirmConfiguredGroupsExist([
                { email: FULL, envVar: 'AUTHZ_ROLE_FULL_GROUPS' }
            ], { getGroup, sleep });
            expect(getGroup.callCount).to.equal(2);
            expect(sleep.calledOnceWith(4000)).to.be.true;
        });
    });

    describe('validateGroupAuthorization', () => {
        let processExitStub;

        beforeEach(() => {
            processExitStub = sinon.stub(process, 'exit');
            sinon.stub(console, 'error');
            sinon.stub(console, 'warn');
            delete process.env.K_SERVICE;
            delete process.env.ALLOWED_GROUP_EMAILS;
            for (const key of Object.keys(process.env)) {
                if (key.startsWith('AUTHZ_ROLE_')) {
                    delete process.env[key];
                }
            }
        });

        it('exits on Cloud Run when a configured group is missing', async () => {
            process.env.K_SERVICE = 'sshf-api';
            process.env.AUTHZ_ROLE_FULL_GROUPS = FULL;
            const getGroup = sinon.stub().rejects(Object.assign(new Error('missing'), { status: 404 }));

            await validateGroupAuthorization({ getGroup, sleep: async () => {} });

            expect(processExitStub.calledOnceWith(1)).to.be.true;
            expect(console.error.called).to.be.true;
            const logged = console.error.firstCall.args.join(' ');
            expect(logged).to.include('AUTHZ_ROLE_FULL_GROUPS');
            expect(logged).to.include(FULL);
        });

        it('exits on Cloud Run after a Directory outage exhausts retries', async () => {
            process.env.K_SERVICE = 'sshf-api';
            process.env.AUTHZ_ROLE_FULL_GROUPS = FULL;
            const sleep = sinon.stub().resolves();
            const getGroup = sinon.stub().rejects(Object.assign(new Error('down'), { status: 503 }));

            await validateGroupAuthorization({ getGroup, sleep });

            expect(getGroup.callCount).to.equal(3);
            expect(processExitStub.calledOnceWith(1)).to.be.true;
            expect(console.error.firstCall.args.join(' ')).to.match(/3 attempts/);
        });

        it('warns and continues locally when Directory cannot confirm the groups', async () => {
            process.env.AUTHZ_ROLE_FULL_GROUPS = FULL;
            const getGroup = sinon.stub().rejects(Object.assign(new Error('missing'), { status: 404 }));

            await validateGroupAuthorization({ getGroup, sleep: async () => {} });

            expect(processExitStub.called).to.be.false;
            expect(console.warn.called).to.be.true;
            expect(console.warn.firstCall.args.join(' ')).to.include(FULL);
        });

        it('exits on Cloud Run for an unknown role variable before calling Directory', async () => {
            process.env.K_SERVICE = 'sshf-api';
            process.env.AUTHZ_ROLE_FULL_GROUPS = FULL;
            process.env.AUTHZ_ROLE_ADMIN_GROUPS = OTHER;
            const getGroup = sinon.stub().resolves({});

            await validateGroupAuthorization({ getGroup, sleep: async () => {} });

            expect(getGroup.called).to.be.false;
            expect(processExitStub.calledOnceWith(1)).to.be.true;
            expect(console.error.firstCall.args.join(' ')).to.include('AUTHZ_ROLE_ADMIN_GROUPS');
        });

        it('does not exit locally when no role groups are configured', async () => {
            const getGroup = sinon.stub().resolves({});
            await validateGroupAuthorization({ getGroup });
            expect(processExitStub.called).to.be.false;
            expect(getGroup.called).to.be.false;
        });

        it('does not exit on Cloud Run when every configured group exists', async () => {
            process.env.K_SERVICE = 'sshf-api';
            Object.assign(process.env, roleEnv());
            delete process.env.ALLOWED_GROUP_EMAILS;
            const getGroup = sinon.stub().resolves({ ok: true });

            await validateGroupAuthorization({ getGroup, sleep: async () => {} });

            expect(processExitStub.called).to.be.false;
            expect(console.error.called).to.be.false;
            expect(getGroup.callCount).to.equal(5);
        });

        it('exits on Cloud Run when only ALLOWED_GROUP_EMAILS is set', async () => {
            process.env.K_SERVICE = 'sshf-api';
            process.env.ALLOWED_GROUP_EMAILS = FULL;
            const getGroup = sinon.stub().resolves({ ok: true });

            await validateGroupAuthorization({ getGroup, sleep: async () => {} });

            expect(getGroup.called).to.be.false;
            expect(processExitStub.calledOnceWith(1)).to.be.true;
            const logged = console.error.firstCall.args.join(' ');
            expect(logged).to.match(/AUTHZ_ROLE_FULL_GROUPS/);
            expect(logged).to.not.match(/ALLOWED_GROUP_EMAILS/);
        });
    });
});

function runGate(req) {
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    let nextCalled = false;
    authorize(req, res, () => {
        nextCalled = true;
    });
    return { res, nextCalled };
}
