import { expect } from 'chai';
import {
    USER_CACHE_TTL_MS,
    USER_CACHE_MAX_ENTRIES,
    hashBearerToken,
    createUserCache
} from '../utils/user_cache.js';

describe('User authentication cache', () => {
    const user = {
        id: 'user-1',
        email: 'steve@starsandstripeshonorflight.org',
        roles: [{ email: 'sshf_app_dev_full_access@starsandstripeshonorflight.org' }]
    };

    it('documents a TTL no longer than 15 minutes and a maximum entry count', () => {
        expect(USER_CACHE_TTL_MS).to.be.at.most(15 * 60 * 1000);
        expect(USER_CACHE_TTL_MS).to.be.greaterThan(0);
        expect(USER_CACHE_MAX_ENTRIES).to.be.a('number');
        expect(USER_CACHE_MAX_ENTRIES).to.be.greaterThan(0);
    });

    it('keys entries by a one-way hash of the bearer token', () => {
        let now = 1_000;
        const cache = createUserCache({ now: () => now, maxEntries: 10 });
        const token = 'ya29.raw-bearer-token';

        cache.set(token, user);

        const digest = hashBearerToken(token);
        expect(digest).to.not.equal(token);
        expect(digest).to.match(/^[a-f0-9]{64}$/);
        expect(cache.keys()).to.deep.equal([digest]);
        expect(cache.keys()).to.not.include(token);
    });

    it('returns a cache hit inside the TTL', () => {
        let now = 1_000;
        const cache = createUserCache({ now: () => now, ttlMs: 15 * 60 * 1000 });

        cache.set('token-a', user);
        now += (15 * 60 * 1000) - 1;

        expect(cache.get('token-a')).to.deep.equal(user);
    });

    it('misses after the TTL and drops that entry', () => {
        let now = 1_000;
        const cache = createUserCache({ now: () => now, ttlMs: 15 * 60 * 1000 });

        cache.set('token-a', user);
        now += 15 * 60 * 1000;

        expect(cache.get('token-a')).to.equal(undefined);
        expect(cache.size()).to.equal(0);
    });

    it('evicts expired entries without waiting for that token to be presented again', () => {
        let now = 0;
        const ttlMs = 15 * 60 * 1000;
        const cache = createUserCache({ now: () => now, ttlMs, maxEntries: 10 });

        cache.set('token-a', user);
        now += ttlMs / 2;
        cache.set('token-b', { ...user, id: 'user-2' });
        now += ttlMs / 2;

        expect(cache.get('token-b').id).to.equal('user-2');
        expect(cache.size()).to.equal(1);
        expect(cache.keys()).to.deep.equal([hashBearerToken('token-b')]);
    });

    it('evicts the least recently used entry when the cap is exceeded', () => {
        let now = 1_000;
        const cache = createUserCache({ now: () => now, ttlMs: 15 * 60 * 1000, maxEntries: 2 });

        cache.set('token-a', { ...user, id: 'a' });
        now += 1;
        cache.set('token-b', { ...user, id: 'b' });
        now += 1;
        cache.get('token-a');
        now += 1;
        cache.set('token-c', { ...user, id: 'c' });

        expect(cache.size()).to.equal(2);
        expect(cache.get('token-b')).to.equal(undefined);
        expect(cache.get('token-a').id).to.equal('a');
        expect(cache.get('token-c').id).to.equal('c');
    });
});
