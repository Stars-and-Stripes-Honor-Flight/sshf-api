import { expect } from 'chai';
import sinon from 'sinon';
import { defaultVerifyIdToken } from '../utils/intake_auth.js';
import { OAuth2Client } from 'google-auth-library';

describe('defaultVerifyIdToken', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('should verify ID token and return payload', async () => {
        const mockPayload = {
            sub: 'service-account@example.iam.gserviceaccount.com',
            aud: 'https://api.example.com',
            email: 'service-account@example.iam.gserviceaccount.com',
            email_verified: true
        };

        const mockTicket = {
            getPayload: () => mockPayload
        };

        sinon.stub(OAuth2Client.prototype, 'verifyIdToken').resolves(mockTicket);

        const result = await defaultVerifyIdToken('test-token', 'https://api.example.com');

        expect(result).to.deep.equal(mockPayload);
    });

    it('should propagate errors from verifyIdToken', async () => {
        const error = new Error('Invalid token');
        sinon.stub(OAuth2Client.prototype, 'verifyIdToken').rejects(error);

        try {
            await defaultVerifyIdToken('invalid-token', 'https://api.example.com');
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err.message).to.equal('Invalid token');
        }
    });
});
