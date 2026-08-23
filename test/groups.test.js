import { expect } from 'chai';
import {
    hasServiceAccountJwtConfig,
    shouldPreferServiceAccountJwt,
    shouldFallbackToServiceAccountJwt
} from '../utils/groups.js';

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
