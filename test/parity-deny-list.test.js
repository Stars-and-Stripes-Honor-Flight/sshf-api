import { expect } from 'chai';
import {
    assertSafeAlignPair,
    assertSafeModernAdapterDb,
    isProductionDatabase
} from '../scripts/parity/db-guards.mjs';

describe('parity database deny-list', () => {
    const productionUrl = 'https://db.starsandstripeshonorflight.org/hf';
    const legacyTestUrl = 'https://db.starsandstripeshonorflight.org/test';
    const prdCopyUrl = 'http://35.255.255.107:5984/test';

    it('treats hf and /hf URLs as production', () => {
        expect(isProductionDatabase('hf')).to.equal(true);
        expect(isProductionDatabase(productionUrl)).to.equal(true);
        expect(isProductionDatabase(`${productionUrl}/`)).to.equal(true);
        expect(isProductionDatabase(legacyTestUrl)).to.equal(false);
    });

    it('throws when align source or target is production hf', () => {
        expect(() => assertSafeAlignPair({ source: productionUrl, target: prdCopyUrl }))
            .to.throw(/hf/);
        expect(() => assertSafeAlignPair({ source: legacyTestUrl, target: productionUrl }))
            .to.throw(/hf/);
        expect(() => assertSafeAlignPair({ source: 'hf', target: 'hf-parity-new' }))
            .to.throw(/hf/);
    });

    it('throws when align target is the living legacy test database', () => {
        expect(() => assertSafeAlignPair({ source: prdCopyUrl, target: legacyTestUrl }))
            .to.throw(/test/);
        expect(() => assertSafeAlignPair({
            source: legacyTestUrl,
            target: 'https://db.starsandstripeshonorflight.org/test'
        })).to.throw(/test/);
    });

    it('allows one-shot align from legacy test onto the sshf-db-prd copy', () => {
        expect(() => assertSafeAlignPair({ source: legacyTestUrl, target: prdCopyUrl }))
            .to.not.throw();
    });

    it('throws when the modern adapter would write legacy test', () => {
        expect(() => assertSafeModernAdapterDb({
            dbUrl: 'https://db.starsandstripeshonorflight.org',
            dbName: 'test'
        })).to.throw(/test/);
        expect(() => assertSafeModernAdapterDb({ dbUrl: legacyTestUrl, dbName: 'test' }))
            .to.throw(/test/);
    });

    it('allows the modern adapter to use sshf-db-prd even when the db name is test', () => {
        expect(() => assertSafeModernAdapterDb({
            dbUrl: 'http://35.255.255.107:5984',
            dbName: 'test'
        })).to.not.throw();
    });
});
