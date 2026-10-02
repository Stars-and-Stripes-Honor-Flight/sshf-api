import { expect } from 'chai';
import {
    POSITIVE_MEMBERSHIP_TTL_MS,
    NEGATIVE_MEMBERSHIP_TTL_MS,
    createMembershipCache
} from '../utils/membership_cache.js';
import { USER_CACHE_TTL_MS } from '../utils/user_cache.js';

describe('Workspace membership cache', () => {
    const userEmail = 'Member@StarsAndStripesHonorFlight.org';
    const groupEmail = 'SSHF_APP_DEV_FULL_ACCESS@starsandstripeshonorflight.org';

    it('keeps a positive result no longer than the user-cache TTL and a negative result for about 2 minutes', () => {
        expect(POSITIVE_MEMBERSHIP_TTL_MS).to.equal(USER_CACHE_TTL_MS);
        expect(POSITIVE_MEMBERSHIP_TTL_MS).to.be.at.most(15 * 60 * 1000);
        expect(NEGATIVE_MEMBERSHIP_TTL_MS).to.equal(2 * 60 * 1000);
        expect(NEGATIVE_MEMBERSHIP_TTL_MS).to.be.lessThan(POSITIVE_MEMBERSHIP_TTL_MS);
    });

    it('returns a positive hit inside the positive TTL and misses after it', () => {
        let now = 1_000;
        const cache = createMembershipCache({ now: () => now });

        const expiresAt = cache.set(userEmail, groupEmail, true);
        expect(expiresAt).to.equal(now + POSITIVE_MEMBERSHIP_TTL_MS);
        expect(cache.get(userEmail.toLowerCase(), groupEmail.toLowerCase())).to.deep.equal({
            isMember: true,
            expiresAt
        });

        now += POSITIVE_MEMBERSHIP_TTL_MS - 1;
        expect(cache.get(userEmail, groupEmail).isMember).to.equal(true);

        now += 1;
        expect(cache.get(userEmail, groupEmail)).to.equal(undefined);
        expect(cache.size()).to.equal(0);
    });

    it('expires a negative result after about 2 minutes', () => {
        let now = 5_000;
        const cache = createMembershipCache({ now: () => now });

        cache.set(userEmail, groupEmail, false);
        now += NEGATIVE_MEMBERSHIP_TTL_MS - 1;
        expect(cache.get(userEmail, groupEmail).isMember).to.equal(false);

        now += 1;
        expect(cache.get(userEmail, groupEmail)).to.equal(undefined);
    });

    it('stores membership per user and group and sweeps expired entries on the next write', () => {
        let now = 0;
        const cache = createMembershipCache({ now: () => now });

        cache.set('one@example.com', 'group-a@example.com', false);
        cache.set('one@example.com', 'group-b@example.com', true);
        cache.set('two@example.com', 'group-a@example.com', true);
        expect(cache.size()).to.equal(3);

        now += NEGATIVE_MEMBERSHIP_TTL_MS;
        cache.set('three@example.com', 'group-a@example.com', true);

        expect(cache.get('one@example.com', 'group-a@example.com')).to.equal(undefined);
        expect(cache.get('one@example.com', 'group-b@example.com').isMember).to.equal(true);
        expect(cache.get('two@example.com', 'group-a@example.com').isMember).to.equal(true);
        expect(cache.size()).to.equal(3);
    });

    it('replaces an existing entry without extending a negative result on read', () => {
        let now = 10_000;
        const cache = createMembershipCache({ now: () => now });

        const firstExpiry = cache.set(userEmail, groupEmail, false);
        now += 30_000;
        const cached = cache.get(userEmail, groupEmail);
        expect(cached.expiresAt).to.equal(firstExpiry);

        now += 1_000;
        const refreshed = cache.set(userEmail, groupEmail, true);
        expect(refreshed).to.equal(now + POSITIVE_MEMBERSHIP_TTL_MS);
        expect(cache.get(userEmail, groupEmail)).to.deep.equal({
            isMember: true,
            expiresAt: refreshed
        });
    });
});
