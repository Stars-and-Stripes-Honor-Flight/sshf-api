import { expect } from 'chai';
import { getAllowedOrigins, buildCorsOptions } from '../utils/cors.js';

describe('CORS utilities', () => {
    const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

    afterEach(() => {
        if (originalAllowedOrigins === undefined) {
            delete process.env.ALLOWED_ORIGINS;
        } else {
            process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
        }
    });

    describe('getAllowedOrigins', () => {
        it('returns localhost defaults when ALLOWED_ORIGINS is unset', () => {
            delete process.env.ALLOWED_ORIGINS;
            expect(getAllowedOrigins()).to.deep.equal([
                'http://localhost:3000',
                'http://localhost:8080'
            ]);
        });

        it('returns localhost defaults when ALLOWED_ORIGINS is empty', () => {
            process.env.ALLOWED_ORIGINS = '';
            expect(getAllowedOrigins()).to.deep.equal([
                'http://localhost:3000',
                'http://localhost:8080'
            ]);
        });

        it('returns localhost defaults when ALLOWED_ORIGINS is whitespace only', () => {
            process.env.ALLOWED_ORIGINS = '   ';
            expect(getAllowedOrigins()).to.deep.equal([
                'http://localhost:3000',
                'http://localhost:8080'
            ]);
        });

        it('parses a comma-separated list of origins', () => {
            process.env.ALLOWED_ORIGINS =
                'http://localhost:3000,https://example.com,https://api.example.com';
            expect(getAllowedOrigins()).to.deep.equal([
                'http://localhost:3000',
                'https://example.com',
                'https://api.example.com'
            ]);
        });

        it('trims whitespace around entries', () => {
            process.env.ALLOWED_ORIGINS =
                ' http://localhost:3000 , https://example.com ';
            expect(getAllowedOrigins()).to.deep.equal([
                'http://localhost:3000',
                'https://example.com'
            ]);
        });

        it('ignores empty entries from trailing or consecutive commas', () => {
            process.env.ALLOWED_ORIGINS = 'http://localhost:3000,,https://example.com,';
            expect(getAllowedOrigins()).to.deep.equal([
                'http://localhost:3000',
                'https://example.com'
            ]);
        });
    });

    describe('buildCorsOptions', () => {
        it('allows requests with no origin', (done) => {
            process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
            const { origin } = buildCorsOptions();
            origin(undefined, (err, allowed) => {
                expect(err).to.be.null;
                expect(allowed).to.be.true;
                done();
            });
        });

        it('allows a listed origin', (done) => {
            process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com';
            const { origin } = buildCorsOptions();
            origin('https://example.com', (err, allowed) => {
                expect(err).to.be.null;
                expect(allowed).to.be.true;
                done();
            });
        });

        it('rejects an unlisted origin with Not allowed by CORS', (done) => {
            process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
            const { origin } = buildCorsOptions();
            origin('https://evil.example.com', (err, allowed) => {
                expect(err).to.be.an('error');
                expect(err.message).to.equal('Not allowed by CORS');
                expect(allowed).to.be.undefined;
                done();
            });
        });
    });
});
