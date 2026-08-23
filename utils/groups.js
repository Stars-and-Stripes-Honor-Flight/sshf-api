/**
 * Choose how to authenticate Admin SDK group lookups.
 *
 * Cloud Run uses Application Default Credentials (the runtime service account).
 * Locally, gcloud user ADC is often present but unusable for Directory API
 * (expired reauth / invalid_rapt, or missing scopes). Prefer the explicit
 * service-account JWT from env, and fall back to it after any ADC failure.
 */

export function hasServiceAccountJwtConfig(env = process.env) {
    return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export function shouldPreferServiceAccountJwt(env = process.env) {
    return hasServiceAccountJwtConfig(env) && !env.K_SERVICE;
}

export function shouldFallbackToServiceAccountJwt(error, env = process.env) {
    return Boolean(error) && hasServiceAccountJwtConfig(env);
}
