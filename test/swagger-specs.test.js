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

    it('loads the review application schemas and intake security scheme', () => {
        const schemas = specs.components?.schemas;
        for (const name of [
            'ReviewApplication',
            'ReviewApplicationIntake',
            'ReviewApplicationSummary',
            'ReviewApplicationList',
            'ReviewApplicationStatusUpdate',
            'ReviewApplicationAcceptResult'
        ]) {
            expect(schemas[name], `missing schema ${name}`).to.be.an('object');
            expect(schemas[name].type).to.equal('object');
        }

        expect(schemas.ReviewApplication.properties.app_status.enum).to.deep.equal(
            ['New', 'Hold', 'Accepted', 'Rejected', 'Trash']
        );

        const intakeScheme = specs.components?.securitySchemes?.IntakeIdToken;
        expect(intakeScheme).to.be.an('object');
        expect(intakeScheme.type).to.equal('http');
        expect(intakeScheme.scheme).to.equal('bearer');
    });

    it('documents every review application route with the intake path using IntakeIdToken', () => {
        expect(specs.paths['/review/applications']).to.have.all.keys('get', 'post');
        expect(specs.paths['/review/applications/{id}']).to.have.all.keys('get', 'put');
        expect(specs.paths['/review/applications/{id}/status']).to.have.all.keys('patch');
        expect(specs.paths['/review/applications/{id}/accept']).to.have.all.keys('post');

        const intake = specs.paths['/review/applications'].post;
        expect(intake.security).to.deep.equal([{ IntakeIdToken: [] }]);
        expect(intake.responses).to.include.all.keys('201', '400', '401', '403');

        const accept = specs.paths['/review/applications/{id}/accept'].post;
        expect(accept.security).to.deep.equal([{ GoogleAuth: [] }]);
        expect(accept.responses).to.include.all.keys('200', '400', '404', '409', '503');
    });

    it('parses @swagger JSDoc YAML into real path items', () => {
        expect(specs.paths).to.be.an('object');

        for (const path of ['/veterans', '/guardians', '/flights']) {
            expect(specs.paths[path], `missing path ${path}`).to.be.an('object');
            expect(Object.keys(specs.paths[path]).length).to.be.greaterThan(0);
        }
    });
});
