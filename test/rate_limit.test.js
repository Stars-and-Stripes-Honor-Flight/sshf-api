import { expect } from 'chai';
import express from 'express';
import sinon from 'sinon';
import {
    baseLimiterOptions,
    readRateLimitConfig,
    userRateLimitKey,
    withUserRateLimit
} from '../utils/rate_limit.js';

const DEFAULTS = {
    disabled: false,
    authFailure: { max: 50, windowMs: 900000 },
    flood: { max: 2000, windowMs: 60000 },
    user: { max: 300, windowMs: 60000 }
};

const BLOCKED_MESSAGE = 'Too many requests. Please wait and try again.';

// Trimmed positive integers are accepted. Zero, negatives, fractions, and
// other non-integers fall back to the default and warn. The flood ceiling
// is removed only when the trimmed value is exactly "off".
// RATE_LIMIT_DISABLED is the exact string "true", and only off Cloud Run
// (K_SERVICE unset or blank).

function warningText(stub) {
    return stub.getCalls().map((call) => call.args.map((arg) => String(arg)).join(' ')).join('\n');
}

function authFailureEnv(max = '3') {
    return {
        RATE_LIMIT_AUTH_FAILURE_MAX: String(max),
        RATE_LIMIT_AUTH_FAILURE_WINDOW_MS: '60000'
    };
}

function floodEnv(max = '3') {
    return {
        RATE_LIMIT_IP_FLOOD_MAX: String(max),
        RATE_LIMIT_IP_FLOOD_WINDOW_MS: '60000'
    };
}

function userEnv(max = '3') {
    return {
        RATE_LIMIT_USER_MAX: String(max),
        RATE_LIMIT_USER_WINDOW_MS: '60000'
    };
}

// Config is read before express-rate-limit is imported. Until the stub is
// replaced, these helpers reject with "not implemented" and do not require
// the package to be installed.
async function createAuthFailureLimiter(env) {
    const config = readRateLimitConfig(env);
    const { rateLimit } = await import('express-rate-limit');
    return rateLimit({
        ...baseLimiterOptions(config, 'auth-failure'),
        windowMs: config.authFailure.windowMs,
        limit: config.authFailure.max,
        skipSuccessfulRequests: true,
        requestWasSuccessful: (_req, res) => res.statusCode !== 401
    });
}

async function createFloodLimiter(env) {
    const config = readRateLimitConfig(env);
    if (!config.flood) {
        return null;
    }
    const { rateLimit } = await import('express-rate-limit');
    return rateLimit({
        ...baseLimiterOptions(config, 'ip-flood'),
        windowMs: config.flood.windowMs,
        limit: config.flood.max
    });
}

async function createUserLimiter(env) {
    const config = readRateLimitConfig(env);
    const { rateLimit } = await import('express-rate-limit');
    return rateLimit({
        ...baseLimiterOptions(config, 'user'),
        windowMs: config.user.windowMs,
        limit: config.user.max,
        keyGenerator: (req) => userRateLimitKey(req)
    });
}

function appWithLimiter(middleware) {
    const app = express();
    app.set('trust proxy', 1);
    if (middleware) {
        app.use(middleware);
    }
    app.use((req, res) => {
        res.status(Number(req.query.status || 200)).end();
    });
    return app;
}

function appWithUserLimiter(middleware) {
    const app = express();
    app.set('trust proxy', 1);
    app.use((req, _res, next) => {
        const email = req.headers['x-user-email'];
        if (typeof email === 'string' && email.trim() !== '') {
            req.user = { email };
        }
        next();
    });
    app.use(middleware);
    app.use((_req, res) => {
        res.status(204).end();
    });
    return app;
}

async function withServer(app, run) {
    const server = await new Promise((resolve, reject) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
        listening.on('error', reject);
    });
    try {
        const { port } = server.address();
        await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

async function send(url, headers) {
    const response = await fetch(url, { headers });
    const text = await response.text();
    let body = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }
    return { status: response.status, body, headers: response.headers };
}

function createRes() {
    return {
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
}

describe('app-wide rate limit', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('configuration', () => {
        it('uses the documented defaults', () => {
            const warn = sinon.stub(console, 'warn');
            expect(readRateLimitConfig({})).to.deep.equal(DEFAULTS);
            expect(warn.called).to.equal(false);
        });

        it('applies positive integer env overrides', () => {
            const config = readRateLimitConfig({
                RATE_LIMIT_AUTH_FAILURE_MAX: '7',
                RATE_LIMIT_AUTH_FAILURE_WINDOW_MS: '120000',
                RATE_LIMIT_IP_FLOOD_MAX: '9',
                RATE_LIMIT_IP_FLOOD_WINDOW_MS: '30000',
                RATE_LIMIT_USER_MAX: '11',
                RATE_LIMIT_USER_WINDOW_MS: '45000'
            });
            expect(config).to.deep.equal({
                disabled: false,
                authFailure: { max: 7, windowMs: 120000 },
                flood: { max: 9, windowMs: 30000 },
                user: { max: 11, windowMs: 45000 }
            });
        });

        it('accepts surrounding whitespace on integer overrides', () => {
            const config = readRateLimitConfig({
                RATE_LIMIT_USER_MAX: ' 40 ',
                RATE_LIMIT_USER_WINDOW_MS: '  15000  '
            });
            expect(config.user).to.deep.equal({ max: 40, windowMs: 15000 });
        });

        it('falls back and warns when a value is zero, negative, fractional, blank, or not an integer', () => {
            const warn = sinon.stub(console, 'warn');
            const config = readRateLimitConfig({
                RATE_LIMIT_AUTH_FAILURE_MAX: '0',
                RATE_LIMIT_AUTH_FAILURE_WINDOW_MS: '-5',
                RATE_LIMIT_IP_FLOOD_MAX: '50abc',
                RATE_LIMIT_IP_FLOOD_WINDOW_MS: '1.5',
                RATE_LIMIT_USER_MAX: '',
                RATE_LIMIT_USER_WINDOW_MS: 'nope'
            });
            expect(config.authFailure).to.deep.equal(DEFAULTS.authFailure);
            expect(config.flood).to.deep.equal(DEFAULTS.flood);
            expect(config.user).to.deep.equal(DEFAULTS.user);
            expect(config.authFailure.max).to.not.equal(0);
            expect(config.flood.max).to.not.equal(0);
            expect(config.user.max).to.not.equal(0);
            const text = warningText(warn);
            expect(text).to.include('RATE_LIMIT_AUTH_FAILURE_MAX');
            expect(text).to.include('RATE_LIMIT_AUTH_FAILURE_WINDOW_MS');
            expect(text).to.include('RATE_LIMIT_IP_FLOOD_MAX');
            expect(text).to.include('RATE_LIMIT_IP_FLOOD_WINDOW_MS');
            expect(text).to.include('RATE_LIMIT_USER_MAX');
            expect(text).to.include('RATE_LIMIT_USER_WINDOW_MS');
            expect(text).to.include('50');
            expect(text).to.include('900000');
            expect(text).to.include('2000');
            expect(text).to.include('60000');
            expect(text).to.include('300');
        });

        it('removes the flood limiter only when the trimmed value is off', () => {
            expect(readRateLimitConfig({ RATE_LIMIT_IP_FLOOD_MAX: 'off' }).flood).to.not.be.ok;
            expect(readRateLimitConfig({ RATE_LIMIT_IP_FLOOD_MAX: ' off ' }).flood).to.not.be.ok;
            const warn = sinon.stub(console, 'warn');
            const config = readRateLimitConfig({ RATE_LIMIT_IP_FLOOD_MAX: 'OFF' });
            expect(config.flood).to.deep.equal(DEFAULTS.flood);
            expect(warningText(warn)).to.include('RATE_LIMIT_IP_FLOOD_MAX');
        });

        it('disables limiters off Cloud Run only when RATE_LIMIT_DISABLED is true', () => {
            const warn = sinon.stub(console, 'warn');
            expect(readRateLimitConfig({ RATE_LIMIT_DISABLED: 'true' }).disabled).to.equal(true);
            expect(readRateLimitConfig({ RATE_LIMIT_DISABLED: 'true', K_SERVICE: '' }).disabled).to.equal(true);
            expect(readRateLimitConfig({ RATE_LIMIT_DISABLED: 'true', K_SERVICE: '   ' }).disabled).to.equal(true);
            expect(readRateLimitConfig({ RATE_LIMIT_DISABLED: 'TRUE' }).disabled).to.equal(false);
            expect(readRateLimitConfig({ RATE_LIMIT_DISABLED: 'false' }).disabled).to.equal(false);
            expect(readRateLimitConfig({}).disabled).to.equal(false);
            expect(warn.called).to.equal(false);
        });

        it('ignores RATE_LIMIT_DISABLED on Cloud Run and warns', () => {
            const warn = sinon.stub(console, 'warn');
            const config = readRateLimitConfig({
                RATE_LIMIT_DISABLED: 'true',
                K_SERVICE: 'sshf-api'
            });
            expect(config.disabled).to.equal(false);
            expect(config.authFailure).to.deep.equal(DEFAULTS.authFailure);
            const text = warningText(warn);
            expect(text).to.include('RATE_LIMIT_DISABLED');
            expect(text).to.include('Cloud Run');
        });

        it('reads process.env when called with no argument', () => {
            const original = process.env.RATE_LIMIT_USER_MAX;
            process.env.RATE_LIMIT_USER_MAX = '17';
            try {
                expect(readRateLimitConfig().user.max).to.equal(17);
            } finally {
                if (original === undefined) {
                    delete process.env.RATE_LIMIT_USER_MAX;
                } else {
                    process.env.RATE_LIMIT_USER_MAX = original;
                }
            }
        });
    });

    describe('pre-auth limiter', () => {
        it('returns 429 on the fourth 401 with the standard headers and JSON message', async () => {
            const middleware = await createAuthFailureLimiter(authFailureEnv());
            const app = appWithLimiter(middleware);
            await withServer(app, async (base) => {
                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(`${base}/?status=401`);
                    expect(allowed.status).to.equal(401);
                }
                const blocked = await send(`${base}/?status=401`);
                expect(blocked.status).to.equal(429);
                expect(blocked.body).to.deep.equal({ message: BLOCKED_MESSAGE });
                expect(blocked.headers.get('content-type')).to.include('application/json');
                expect(blocked.headers.get('ratelimit')).to.be.a('string').and.not.empty;
                expect(blocked.headers.get('ratelimit-policy')).to.be.a('string').and.not.empty;
                expect(blocked.headers.get('retry-after')).to.match(/^[1-9]\d*$/);
                for (const name of blocked.headers.keys()) {
                    expect(name.toLowerCase().startsWith('x-ratelimit'), name).to.equal(false);
                }
            });
        });

        it('logs the limiter name and key and never the Authorization header', async () => {
            const warn = sinon.stub(console, 'warn');
            const middleware = await createAuthFailureLimiter(authFailureEnv());
            const app = appWithLimiter(middleware);
            const headers = { authorization: 'Bearer super-secret-token' };
            await withServer(app, async (base) => {
                for (const _attempt of [1, 2, 3, 4]) {
                    await send(`${base}/?status=401`, headers);
                }
            });
            const text = warningText(warn);
            expect(text).to.include('Rate limit auth-failure exceeded for key 127.0.0.1');
            expect(text).to.not.include('super-secret-token');
            expect(text).to.not.include('Bearer');
        });

        it('does not count 200, 403, or 404 responses', async () => {
            const middleware = await createAuthFailureLimiter(authFailureEnv());
            const app = appWithLimiter(middleware);
            await withServer(app, async (base) => {
                for (const status of [200, 200, 200, 403, 403, 403, 404, 404, 404]) {
                    const response = await send(`${base}/?status=${status}`);
                    expect(response.status).to.equal(status);
                }
                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(`${base}/?status=401`);
                    expect(allowed.status).to.equal(401);
                }
                const blocked = await send(`${base}/?status=401`);
                expect(blocked.status).to.equal(429);
            });
        });

        it('keeps the client key when a leading X-Forwarded-For entry is spoofed', async () => {
            const warn = sinon.stub(console, 'warn');
            const middleware = await createAuthFailureLimiter(authFailureEnv());
            const app = appWithLimiter(middleware);
            await withServer(app, async (base) => {
                const sameClient = [
                    '203.0.113.9, 198.51.100.20',
                    '198.51.100.20',
                    '192.0.2.8, 198.51.100.20',
                    '198.51.100.8, 198.51.100.20'
                ];
                const statuses = [];
                for (const forwarded of sameClient) {
                    const response = await send(`${base}/?status=401`, {
                        'x-forwarded-for': forwarded
                    });
                    statuses.push(response.status);
                }
                expect(statuses).to.deep.equal([401, 401, 401, 429]);
                const otherClient = await send(`${base}/?status=401`, {
                    'x-forwarded-for': '203.0.113.9, 198.51.100.21'
                });
                expect(otherClient.status).to.equal(401);
            });
            const text = warningText(warn);
            expect(text).to.include('Rate limit auth-failure exceeded for key 198.51.100.20');
            expect(text).to.not.include('203.0.113.9');
        });

        it('keeps the built-in validation that rejects a permissive trust proxy', async () => {
            const errorLog = sinon.stub(console, 'error');
            const middleware = await createAuthFailureLimiter(authFailureEnv('10'));
            const app = express();
            app.set('trust proxy', true);
            app.use(middleware);
            app.use((_req, res) => {
                res.status(401).end();
            });
            await withServer(app, async (base) => {
                const response = await send(base + '/', {
                    'x-forwarded-for': '203.0.113.9'
                });
                expect(response.status).to.equal(401);
            });
            expect(warningText(errorLog)).to.include('ERR_ERL_PERMISSIVE_TRUST_PROXY');
        });
    });

    describe('flood limiter', () => {
        it('counts every response status', async () => {
            const middleware = await createFloodLimiter(floodEnv());
            expect(middleware).to.be.a('function');
            const app = appWithLimiter(middleware);
            await withServer(app, async (base) => {
                const statuses = [];
                for (const status of [200, 404, 403, 200]) {
                    const response = await send(`${base}/?status=${status}`);
                    statuses.push(response.status);
                }
                expect(statuses).to.deep.equal([200, 404, 403, 429]);
            });
        });

        it('is not mounted when the flood max is off', async () => {
            const config = readRateLimitConfig({ RATE_LIMIT_IP_FLOOD_MAX: 'off' });
            expect(config.flood).to.not.be.ok;
            const middleware = await createFloodLimiter({ RATE_LIMIT_IP_FLOOD_MAX: 'off' });
            expect(middleware).to.equal(null);
            const authLimiter = await createAuthFailureLimiter({
                RATE_LIMIT_IP_FLOOD_MAX: 'off',
                RATE_LIMIT_AUTH_FAILURE_MAX: '2',
                RATE_LIMIT_AUTH_FAILURE_WINDOW_MS: '60000'
            });
            const app = appWithLimiter(authLimiter);
            await withServer(app, async (base) => {
                for (const _attempt of [1, 2, 3, 4, 5]) {
                    const response = await send(`${base}/?status=200`);
                    expect(response.status).to.equal(200);
                }
            });
        });
    });

    describe('per-user limiter', () => {
        it('returns 429 on the fourth request from one email', async () => {
            const middleware = await createUserLimiter(userEnv());
            const app = appWithUserLimiter(middleware);
            await withServer(app, async (base) => {
                const headers = { 'x-user-email': 'ada@example.com' };
                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(base + '/', headers);
                    expect(allowed.status).to.equal(204);
                }
                const blocked = await send(base + '/', headers);
                expect(blocked.status).to.equal(429);
                expect(blocked.body).to.deep.equal({ message: BLOCKED_MESSAGE });
            });
        });

        it('treats email keys as case-insensitive', async () => {
            const middleware = await createUserLimiter(userEnv());
            const app = appWithUserLimiter(middleware);
            await withServer(app, async (base) => {
                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(base + '/', { 'x-user-email': 'Ada@Example.com' });
                    expect(allowed.status).to.equal(204);
                }
                const blocked = await send(base + '/', { 'x-user-email': 'ada@example.com' });
                expect(blocked.status).to.equal(429);
            });
        });

        it('gives a second user a separate budget', async () => {
            const middleware = await createUserLimiter(userEnv());
            const app = appWithUserLimiter(middleware);
            await withServer(app, async (base) => {
                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(base + '/', { 'x-user-email': 'ada@example.com' });
                    expect(allowed.status).to.equal(204);
                }
                const other = await send(base + '/', { 'x-user-email': 'bob@example.com' });
                expect(other.status).to.equal(204);
                const blocked = await send(base + '/', { 'x-user-email': 'ada@example.com' });
                expect(blocked.status).to.equal(429);
            });
        });

        it('falls back to the client IP when the email is missing', async () => {
            const middleware = await createUserLimiter(userEnv());
            const app = appWithUserLimiter(middleware);
            await withServer(app, async (base) => {
                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(base + '/', { 'x-forwarded-for': '198.51.100.10' });
                    expect(allowed.status).to.equal(204);
                }
                const blocked = await send(base + '/', { 'x-forwarded-for': '198.51.100.10' });
                expect(blocked.status).to.equal(429);
                const other = await send(base + '/', { 'x-forwarded-for': '198.51.100.11' });
                expect(other.status).to.equal(204);

                for (const _attempt of [1, 2, 3]) {
                    const allowed = await send(base + '/', {
                        'x-forwarded-for': '2001:db8:abcd:12ff::1'
                    });
                    expect(allowed.status).to.equal(204);
                }
                const sameSubnet = await send(base + '/', {
                    'x-forwarded-for': '2001:db8:abcd:1200::2'
                });
                expect(sameSubnet.status).to.equal(429);
                const otherSubnet = await send(base + '/', {
                    'x-forwarded-for': '2001:db8:abcd:1300::1'
                });
                expect(otherSubnet.status).to.equal(204);
            });
        });
    });

    describe('userRateLimitKey', () => {
        it('lowercases and trims an email and ignores a blank email', () => {
            expect(userRateLimitKey({
                user: { email: '  Ada@Example.com ' },
                ip: '203.0.113.9'
            })).to.equal('ada@example.com');
            const fallback = userRateLimitKey({ ip: '203.0.113.9' });
            expect(userRateLimitKey({ user: { email: '   ' }, ip: '203.0.113.9' })).to.equal(fallback);
            expect(userRateLimitKey({ user: { email: 12 }, ip: '203.0.113.9' })).to.equal(fallback);
            expect(userRateLimitKey({ user: {}, ip: '203.0.113.9' })).to.equal(fallback);
            expect(fallback).to.not.include('@');
        });

        it('keeps an IPv4 fallback as the address and groups IPv6 by /56', () => {
            expect(userRateLimitKey({ ip: '203.0.113.9' })).to.equal('203.0.113.9');
            expect(userRateLimitKey({ ip: '203.0.113.10' })).to.not.equal('203.0.113.9');
            expect(userRateLimitKey({ ip: '::ffff:203.0.113.9' })).to.equal('203.0.113.9');
            const sameA = userRateLimitKey({ ip: '2001:db8:abcd:12ff::1' });
            const sameB = userRateLimitKey({ ip: '2001:db8:abcd:1200::2' });
            const other = userRateLimitKey({ ip: '2001:db8:abcd:1300::1' });
            expect(sameA).to.equal(sameB);
            expect(sameA).to.not.equal(other);
            expect(sameA).to.not.equal('2001:db8:abcd:12ff::1');
        });
    });

    describe('withUserRateLimit', () => {
        async function verify(req, res, next) {
            if (req.authStatus) {
                res.status(req.authStatus).json({ message: 'denied' });
                return;
            }
            req.user = { email: 'Ada@Example.com' };
            next();
        }

        it('returns a function named authenticate', () => {
            const authenticate = withUserRateLimit(verify, (_req, _res, next) => next());
            expect(authenticate).to.be.a('function');
            expect(authenticate.name).to.equal('authenticate');
        });

        it('does not call the limiter when auth responds 401, 403, or 503', async () => {
            const limiter = sinon.spy((_req, _res, next) => next());
            const authenticate = withUserRateLimit(verify, limiter);
            for (const authStatus of [401, 403, 503]) {
                const res = createRes();
                const next = sinon.spy();
                await authenticate({ authStatus }, res, next);
                expect(res.statusCode, String(authStatus)).to.equal(authStatus);
                expect(next.called, String(authStatus)).to.equal(false);
            }
            expect(limiter.called).to.equal(false);
        });

        it('calls the limiter once after auth calls next', async () => {
            const limiter = sinon.spy((_req, _res, next) => next());
            const authenticate = withUserRateLimit(verify, limiter);
            const req = {};
            const next = sinon.spy();
            await authenticate(req, createRes(), next);
            expect(limiter.calledOnce).to.equal(true);
            expect(next.calledOnce).to.equal(true);
            expect(limiter.calledBefore(next)).to.equal(true);
            expect(req.user.email).to.equal('Ada@Example.com');
        });
    });
});
