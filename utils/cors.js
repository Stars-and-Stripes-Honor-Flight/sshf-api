const DEFAULT_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:8080'
];

export function getAllowedOrigins() {
    const raw = process.env.ALLOWED_ORIGINS;
    if (!raw || raw.trim() === '') {
        return [...DEFAULT_ORIGINS];
    }
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export function buildCorsOptions() {
    const allowedOrigins = getAllowedOrigins();
    return {
        origin(origin, callback) {
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    };
}
