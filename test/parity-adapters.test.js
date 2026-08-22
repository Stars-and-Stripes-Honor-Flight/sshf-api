import { expect } from 'chai';
import sinon from 'sinon';
import { alignDatabases, main as alignMain } from '../scripts/parity/align-dbs.mjs';
import { createModernAdapter } from '../scripts/parity/adapters/modern-api.mjs';
import { createLegacyCouchAdapter } from '../scripts/parity/adapters/legacy-couch.mjs';
import { loadScenario, resolveIds } from '../scripts/parity/run-scenario.mjs';

describe('parity adapters and align', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('align dry-run returns the replicate body without posting', async () => {
        const fetchImpl = sinon.stub();
        const result = await alignDatabases({
            source: 'https://db.starsandstripeshonorflight.org/test',
            target: 'http://35.255.255.107:5984/test',
            apply: false,
            fetchImpl
        });
        expect(result.dryRun).to.equal(true);
        expect(result.body.target).to.include('35.255.255.107');
        expect(fetchImpl.called).to.equal(false);
    });

    it('align --apply posts to _replicate after deny-list checks', async () => {
        const fetchImpl = sinon.stub().resolves({
            ok: true,
            json: async () => ({ ok: true, history: true })
        });
        const result = await alignMain([], {
            PARITY_SOURCE_URL: 'https://db.starsandstripeshonorflight.org/test',
            PARITY_TARGET_URL: 'http://35.255.255.107:5984/test',
            DB_USER: 'user',
            DB_PASS: 'pass'
        });
        expect(result.dryRun).to.equal(true);

        await alignDatabases({
            source: 'https://db.starsandstripeshonorflight.org/test',
            target: 'http://35.255.255.107:5984/test',
            apply: true,
            replicateEndpoint: 'https://db.starsandstripeshonorflight.org/_replicate',
            fetchImpl
        });
        expect(fetchImpl.calledOnce).to.equal(true);
        expect(fetchImpl.firstCall.args[0]).to.equal('https://db.starsandstripeshonorflight.org/_replicate');
    });

    it('refuses to construct a modern adapter against legacy test', () => {
        expect(() => createModernAdapter({
            apiBase: 'http://localhost:8080',
            token: 't',
            dbUrl: 'https://db.starsandstripeshonorflight.org',
            dbName: 'test'
        })).to.throw(/legacy test/);
    });

    it('refuses to construct a legacy adapter against production hf', () => {
        expect(() => createLegacyCouchAdapter({
            dbUrl: 'https://db.starsandstripeshonorflight.org/hf'
        })).to.throw(/hf/);
    });

    it('modern editVetNote GETs then PUTs the veteran', async () => {
        const fetchImpl = sinon.stub();
        fetchImpl.onFirstCall().resolves({
            ok: true,
            json: async () => ({ _id: 'v1', flight: { status_note: 'old' } })
        });
        fetchImpl.onSecondCall().resolves({
            ok: true,
            json: async () => ({ ok: true })
        });
        const adapter = createModernAdapter({
            apiBase: 'http://localhost:8080',
            token: 't',
            dbUrl: 'http://35.255.255.107:5984',
            dbName: 'test',
            fetchImpl
        });
        await adapter.editVetNote('v1', 'new note');
        expect(fetchImpl.secondCall.args[0]).to.equal('http://localhost:8080/veterans/v1');
        expect(fetchImpl.secondCall.args[1].method).to.equal('PUT');
        const body = JSON.parse(fetchImpl.secondCall.args[1].body);
        expect(body.flight.status_note).to.equal('new note');
    });

    it('legacy editVetNote PUTs the Evently mutation to CouchDB', async () => {
        const fetchImpl = sinon.stub();
        fetchImpl.onFirstCall().resolves({
            ok: true,
            json: async () => ({
                _id: 'v1',
                flight: { status_note: 'old', history: [] },
                metadata: {}
            })
        });
        fetchImpl.onSecondCall().resolves({
            ok: true,
            json: async () => ({ ok: true })
        });
        const adapter = createLegacyCouchAdapter({
            dbUrl: 'https://db.starsandstripeshonorflight.org/test',
            user: 'u',
            pass: 'p',
            fetchImpl
        });
        await adapter.editVetNote('v1', 'new note', {
            userName: 'harness-user',
            timestamp: '2026-08-22T18:00:00Z'
        });
        const body = JSON.parse(fetchImpl.secondCall.args[1].body);
        expect(body.flight.status_note).to.equal('new note');
        expect(body.metadata.updated_by).to.equal('harness-user');
    });

    it('loads first-wave scenario files', () => {
        expect(loadScenario('00-empty-clone').operation).to.equal('baseline');
        expect(loadScenario('01-edit-vet-note').operation).to.equal('editVetNote');
        expect(loadScenario('07-add-to-flight').args.veteranCount).to.equal(1);
        expect(resolveIds({ ids: [] }, { veteran: 'abc' })).to.deep.equal(['abc']);
    });
});
