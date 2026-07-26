import { expect } from 'chai';
import {
    getAllowedClientIds,
    getAllowedEmailDomains,
    getAllowedGroupEmails,
    assertValidTokenClaims,
    assertUserInAllowedGroups,
    authorize,
    TokenAudienceError,
    DomainNotAllowedError,
    GroupNotAllowedError
} from '../utils/auth.js';

const OUR_CLIENT_ID = '111111111111-ourapp.apps.googleusercontent.com';
const OTHER_CLIENT_ID = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com'; // e.g. gcloud
const FULL_ACCESS_GROUP = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';
const OTHER_GROUP = 'some-other-group@starsandstripeshonorflight.org';

describe('Auth token validation utilities', () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalAllowedClientIds = process.env.ALLOWED_CLIENT_IDS;
    const originalAllowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
    const originalAllowedGroups = process.env.ALLOWED_GROUP_EMAILS;

    const restore = (key, value) => {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    };

    afterEach(() => {
        restore('GOOGLE_CLIENT_ID', originalClientId);
        restore('ALLOWED_CLIENT_IDS', originalAllowedClientIds);
        restore('ALLOWED_EMAIL_DOMAINS', originalAllowedDomains);
        restore('ALLOWED_GROUP_EMAILS', originalAllowedGroups);
    });

    describe('getAllowedClientIds', () => {
        it('returns an empty list when nothing is configured', () => {
            delete process.env.GOOGLE_CLIENT_ID;
            delete process.env.ALLOWED_CLIENT_IDS;
            expect(getAllowedClientIds()).to.deep.equal([]);
        });

        it('falls back to GOOGLE_CLIENT_ID when ALLOWED_CLIENT_IDS is unset', () => {
            process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
            delete process.env.ALLOWED_CLIENT_IDS;
            expect(getAllowedClientIds()).to.deep.equal([OUR_CLIENT_ID]);
        });

        it('prefers ALLOWED_CLIENT_IDS and parses a comma-separated list', () => {
            process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
            process.env.ALLOWED_CLIENT_IDS = ` ${OUR_CLIENT_ID} , ${OTHER_CLIENT_ID} ,`;
            expect(getAllowedClientIds()).to.deep.equal([OUR_CLIENT_ID, OTHER_CLIENT_ID]);
        });
    });

    describe('getAllowedEmailDomains', () => {
        it('returns an empty list when ALLOWED_EMAIL_DOMAINS is unset', () => {
            delete process.env.ALLOWED_EMAIL_DOMAINS;
            expect(getAllowedEmailDomains()).to.deep.equal([]);
        });

        it('parses, trims, and lowercases a comma-separated list', () => {
            process.env.ALLOWED_EMAIL_DOMAINS = ' Example.ORG , Foo.com ';
            expect(getAllowedEmailDomains()).to.deep.equal(['example.org', 'foo.com']);
        });
    });

    describe('assertValidTokenClaims - audience', () => {
        const options = { allowedClientIds: [OUR_CLIENT_ID] };

        it('passes when aud matches an allowed client id', () => {
            expect(() => assertValidTokenClaims({ aud: OUR_CLIENT_ID }, options)).to.not.throw();
        });

        it('throws TokenAudienceError when aud belongs to a different client (the exploit case)', () => {
            expect(() => assertValidTokenClaims({ aud: OTHER_CLIENT_ID }, options))
                .to.throw(TokenAudienceError);
        });

        it('throws TokenAudienceError when aud is missing', () => {
            expect(() => assertValidTokenClaims({ aud: undefined }, options))
                .to.throw(TokenAudienceError);
        });

        it('throws TokenAudienceError when no client ids are configured', () => {
            expect(() => assertValidTokenClaims({ aud: OUR_CLIENT_ID }, { allowedClientIds: [] }))
                .to.throw(TokenAudienceError);
        });

        it('reads allowed client ids from the environment when options are omitted', () => {
            process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
            delete process.env.ALLOWED_CLIENT_IDS;
            delete process.env.ALLOWED_EMAIL_DOMAINS;
            expect(() => assertValidTokenClaims({ aud: OUR_CLIENT_ID })).to.not.throw();
            expect(() => assertValidTokenClaims({ aud: OTHER_CLIENT_ID })).to.throw(TokenAudienceError);
        });
    });

    describe('assertValidTokenClaims - email domain (opt-in)', () => {
        const base = { allowedClientIds: [OUR_CLIENT_ID], allowedEmailDomains: ['starsandstripeshonorflight.org'] };

        it('does not check the domain when no domains are configured', () => {
            const options = { allowedClientIds: [OUR_CLIENT_ID], allowedEmailDomains: [] };
            expect(() => assertValidTokenClaims(
                { aud: OUR_CLIENT_ID, email: 'stranger@gmail.com', emailVerified: true },
                options
            )).to.not.throw();
        });

        it('passes for an allowed, verified domain (boolean true)', () => {
            expect(() => assertValidTokenClaims(
                { aud: OUR_CLIENT_ID, email: 'steve@starsandstripeshonorflight.org', emailVerified: true },
                base
            )).to.not.throw();
        });

        it('passes when email_verified arrives as the string "true"', () => {
            expect(() => assertValidTokenClaims(
                { aud: OUR_CLIENT_ID, email: 'steve@STARSANDSTRIPESHONORFLIGHT.org', emailVerified: 'true' },
                base
            )).to.not.throw();
        });

        it('throws DomainNotAllowedError for a disallowed domain', () => {
            expect(() => assertValidTokenClaims(
                { aud: OUR_CLIENT_ID, email: 'attacker@gmail.com', emailVerified: true },
                base
            )).to.throw(DomainNotAllowedError);
        });

        it('throws DomainNotAllowedError when the email is unverified', () => {
            expect(() => assertValidTokenClaims(
                { aud: OUR_CLIENT_ID, email: 'steve@starsandstripeshonorflight.org', emailVerified: false },
                base
            )).to.throw(DomainNotAllowedError);
        });

        it('throws DomainNotAllowedError when the email is missing', () => {
            expect(() => assertValidTokenClaims(
                { aud: OUR_CLIENT_ID, emailVerified: true },
                base
            )).to.throw(DomainNotAllowedError);
        });

        it('checks audience before domain', () => {
            expect(() => assertValidTokenClaims(
                { aud: OTHER_CLIENT_ID, email: 'steve@starsandstripeshonorflight.org', emailVerified: true },
                base
            )).to.throw(TokenAudienceError);
        });
    });

    describe('getAllowedGroupEmails', () => {
        it('returns an empty list when ALLOWED_GROUP_EMAILS is unset', () => {
            delete process.env.ALLOWED_GROUP_EMAILS;
            expect(getAllowedGroupEmails()).to.deep.equal([]);
        });

        it('parses, trims, and lowercases a comma-separated list', () => {
            process.env.ALLOWED_GROUP_EMAILS =
                ` ${FULL_ACCESS_GROUP.toUpperCase()} , ${OTHER_GROUP} `;
            expect(getAllowedGroupEmails()).to.deep.equal([
                FULL_ACCESS_GROUP,
                OTHER_GROUP
            ]);
        });
    });

    describe('assertUserInAllowedGroups', () => {
        const memberRoles = [{ email: FULL_ACCESS_GROUP, name: 'Full Access' }];
        const otherRoles = [{ email: OTHER_GROUP, name: 'Other' }];

        it('does not check groups when the allow-list is empty', () => {
            expect(() => assertUserInAllowedGroups([], { allowedGroupEmails: [] })).to.not.throw();
            expect(() => assertUserInAllowedGroups(otherRoles, { allowedGroupEmails: [] })).to.not.throw();
        });

        it('passes when the user is in an allowed group', () => {
            expect(() => assertUserInAllowedGroups(memberRoles, {
                allowedGroupEmails: [FULL_ACCESS_GROUP]
            })).to.not.throw();
        });

        it('matches group emails case-insensitively', () => {
            expect(() => assertUserInAllowedGroups(
                [{ email: FULL_ACCESS_GROUP.toUpperCase() }],
                { allowedGroupEmails: [FULL_ACCESS_GROUP] }
            )).to.not.throw();
        });

        it('throws GroupNotAllowedError when the user is not in an allowed group', () => {
            expect(() => assertUserInAllowedGroups(otherRoles, {
                allowedGroupEmails: [FULL_ACCESS_GROUP]
            })).to.throw(GroupNotAllowedError);
        });

        it('throws GroupNotAllowedError when roles are empty and groups are configured (fail closed)', () => {
            expect(() => assertUserInAllowedGroups([], {
                allowedGroupEmails: [FULL_ACCESS_GROUP]
            })).to.throw(GroupNotAllowedError);
        });

        it('throws GroupNotAllowedError when roles are missing and groups are configured', () => {
            expect(() => assertUserInAllowedGroups(undefined, {
                allowedGroupEmails: [FULL_ACCESS_GROUP]
            })).to.throw(GroupNotAllowedError);
        });

        it('reads allowed groups from the environment when options are omitted', () => {
            process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;
            expect(() => assertUserInAllowedGroups(memberRoles)).to.not.throw();
            expect(() => assertUserInAllowedGroups(otherRoles)).to.throw(GroupNotAllowedError);
        });
    });

    describe('authorize middleware', () => {
        const createRes = () => {
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
            return res;
        };

        it('calls next when the user is in an allowed group', () => {
            process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;
            const req = { user: { roles: [{ email: FULL_ACCESS_GROUP }] } };
            const res = createRes();
            let nextCalled = false;
            authorize(req, res, () => { nextCalled = true; });
            expect(nextCalled).to.equal(true);
            expect(res.statusCode).to.equal(null);
        });

        it('returns 403 when the user is not in an allowed group', () => {
            process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;
            const req = { user: { roles: [{ email: OTHER_GROUP }] } };
            const res = createRes();
            let nextCalled = false;
            authorize(req, res, () => { nextCalled = true; });
            expect(nextCalled).to.equal(false);
            expect(res.statusCode).to.equal(403);
            expect(res.body).to.deep.equal({ message: 'Forbidden: Account not permitted' });
        });

        it('returns 403 when roles are empty and groups are configured', () => {
            process.env.ALLOWED_GROUP_EMAILS = FULL_ACCESS_GROUP;
            const req = { user: { roles: [] } };
            const res = createRes();
            let nextCalled = false;
            authorize(req, res, () => { nextCalled = true; });
            expect(nextCalled).to.equal(false);
            expect(res.statusCode).to.equal(403);
        });

        it('calls next when ALLOWED_GROUP_EMAILS is unset', () => {
            delete process.env.ALLOWED_GROUP_EMAILS;
            const req = { user: { roles: [] } };
            const res = createRes();
            let nextCalled = false;
            authorize(req, res, () => { nextCalled = true; });
            expect(nextCalled).to.equal(true);
        });
    });
});
