/**
 * Rate limit configuration and helpers used from index.js.
 * See docs/RATE_LIMITING_PLAN.md.
 */
import { ipKeyGenerator } from 'express-rate-limit';

const DEFAULT_AUTH_FAILURE = Object.freeze({ max: 50, windowMs: 900000 });
const DEFAULT_FLOOD = Object.freeze({ max: 2000, windowMs: 60000 });
const DEFAULT_USER = Object.freeze({ max: 300, windowMs: 60000 });

const BLOCKED_MESSAGE = 'Too many requests. Please wait and try again.';

function isCloudRun(env) {
    return typeof env.K_SERVICE === 'string' && env.K_SERVICE.trim() !== '';
}

function warnInvalid(envVar, raw, fallback) {
    const shown = raw === undefined || raw === null ? '(unset)' : String(raw);
    console.warn(
        `Invalid ${envVar} value ${shown}; using default ${fallback}.`
    );
}

function parsePositiveInt(raw, envVar, defaultValue) {
    if (raw === undefined || raw === null) {
        return defaultValue;
    }
    const trimmed = String(raw).trim();
    if (trimmed === '' || !/^\d+$/.test(trimmed)) {
        warnInvalid(envVar, raw, defaultValue);
        return defaultValue;
    }
    const parsed = Number(trimmed);
    if (parsed <= 0) {
        warnInvalid(envVar, raw, defaultValue);
        return defaultValue;
    }
    return parsed;
}

function parseFloodConfig(env) {
    const rawMax = env.RATE_LIMIT_IP_FLOOD_MAX;
    if (rawMax === undefined || rawMax === null) {
        return {
            max: DEFAULT_FLOOD.max,
            windowMs: parsePositiveInt(
                env.RATE_LIMIT_IP_FLOOD_WINDOW_MS,
                'RATE_LIMIT_IP_FLOOD_WINDOW_MS',
                DEFAULT_FLOOD.windowMs
            )
        };
    }
    const trimmedMax = String(rawMax).trim();
    if (trimmedMax === 'off') {
        return null;
    }
    const max = parsePositiveInt(rawMax, 'RATE_LIMIT_IP_FLOOD_MAX', DEFAULT_FLOOD.max);
    const windowMs = parsePositiveInt(
        env.RATE_LIMIT_IP_FLOOD_WINDOW_MS,
        'RATE_LIMIT_IP_FLOOD_WINDOW_MS',
        DEFAULT_FLOOD.windowMs
    );
    return { max, windowMs };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readRateLimitConfig(env = process.env) {
    let disabled = false;
    if (env.RATE_LIMIT_DISABLED === 'true') {
        if (isCloudRun(env)) {
            console.warn(
                'RATE_LIMIT_DISABLED is ignored on Cloud Run; rate limiting stays enabled.'
            );
        } else {
            disabled = true;
        }
    }

    const authFailure = {
        max: parsePositiveInt(
            env.RATE_LIMIT_AUTH_FAILURE_MAX,
            'RATE_LIMIT_AUTH_FAILURE_MAX',
            DEFAULT_AUTH_FAILURE.max
        ),
        windowMs: parsePositiveInt(
            env.RATE_LIMIT_AUTH_FAILURE_WINDOW_MS,
            'RATE_LIMIT_AUTH_FAILURE_WINDOW_MS',
            DEFAULT_AUTH_FAILURE.windowMs
        )
    };

    const flood = parseFloodConfig(env);

    const user = {
        max: parsePositiveInt(
            env.RATE_LIMIT_USER_MAX,
            'RATE_LIMIT_USER_MAX',
            DEFAULT_USER.max
        ),
        windowMs: parsePositiveInt(
            env.RATE_LIMIT_USER_WINDOW_MS,
            'RATE_LIMIT_USER_WINDOW_MS',
            DEFAULT_USER.windowMs
        )
    };

    return {
        disabled,
        authFailure,
        flood,
        user
    };
}

export function baseLimiterOptions(_config, limiterName) {
    return {
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res, _next, options) => {
            const key = options?.key ?? req.rateLimit?.key ?? req.ip ?? '';
            console.warn(`Rate limit ${limiterName} exceeded for key ${key}`);
            res.status(429).json({ message: BLOCKED_MESSAGE });
        }
    };
}

export function userRateLimitKey(req) {
    const email = req.user?.email;
    if (typeof email === 'string') {
        const normalized = email.trim().toLowerCase();
        if (normalized !== '') {
            return normalized;
        }
    }
    return ipKeyGenerator(req.ip);
}

export function withUserRateLimit(verifyGoogleUser, userLimiter) {
    async function authenticate(req, res, next) {
        await verifyGoogleUser(req, res, (err) => {
            if (err) {
                next(err);
                return;
            }
            userLimiter(req, res, next);
        });
    }
    return authenticate;
}
