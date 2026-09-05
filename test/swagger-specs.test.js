import { expect } from 'chai';
import { specs } from '../swagger/swagger.js';

describe('OpenAPI spec generation', () => {
    it('loads a valid OpenAPI 3 document with API metadata', () => {
        expect(specs).to.be.an('object');
        expect(specs.openapi).to.equal('3.0.0');
        expect(specs.info).to.be.an('object');
        expect(specs.info.title).to.be.a('string').and.not.empty;
    });

    it('loads YAML schema files into components.schemas', () => {
        const schemas = specs.components?.schemas;
        expect(schemas).to.be.an('object');

        for (const name of ['Veteran', 'Guardian', 'Flight', 'Error']) {
            expect(schemas[name], `missing schema ${name}`).to.be.an('object');
            expect(schemas[name].type).to.equal('object');
        }
    });

    it('parses @swagger JSDoc YAML into real path items', () => {
        expect(specs.paths).to.be.an('object');

        for (const path of ['/veterans', '/guardians', '/flights']) {
            expect(specs.paths[path], `missing path ${path}`).to.be.an('object');
            expect(Object.keys(specs.paths[path]).length).to.be.greaterThan(0);
        }
    });
});
