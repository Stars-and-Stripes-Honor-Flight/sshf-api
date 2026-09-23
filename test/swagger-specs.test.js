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

        for (const name of [
            'Veteran',
            'Guardian',
            'Flight',
            'Error',
            'DocRevision',
            'DocRevisionList',
            'DocDiffChange',
            'DocDiff'
        ]) {
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

    it('documents document revision list and diff endpoints', () => {
        const revisions = specs.paths['/docs/{id}/revisions']?.get;
        const diff = specs.paths['/docs/{id}/diff']?.get;

        expect(revisions, 'missing /docs/{id}/revisions').to.be.an('object');
        expect(diff, 'missing /docs/{id}/diff').to.be.an('object');

        expect(revisions.security).to.deep.equal([{ GoogleAuth: [] }]);
        expect(diff.security).to.deep.equal([{ GoogleAuth: [] }]);
        expect(revisions.responses).to.include.all.keys('200', '401', '403', '404', '503');
        expect(diff.responses).to.include.all.keys('200', '400', '401', '403', '404', '503');

        expect(diff.parameters.map((param) => param.name)).to.include.members(['from', 'to']);
        expect(revisions.responses['200'].content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/DocRevisionList');
        expect(diff.responses['200'].content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/DocDiff');
    });

    it('documents invalid document ids on routes that validate them', () => {
        const operations = [
            ['/docs/{id}', 'get'],
            ['/docs/{id}', 'put'],
            ['/docs/{id}', 'delete'],
            ['/docs/{id}/revisions', 'get'],
            ['/docs/{id}/diff', 'get'],
            ['/veterans/{id}', 'get'],
            ['/veterans/{id}', 'put'],
            ['/veterans/{id}', 'delete'],
            ['/veterans/{id}/seat', 'patch'],
            ['/veterans/{id}/bus', 'patch'],
            ['/guardians/{id}', 'get'],
            ['/guardians/{id}', 'put'],
            ['/guardians/{id}', 'delete'],
            ['/guardians/{id}/seat', 'patch'],
            ['/guardians/{id}/bus', 'patch'],
            ['/flights/{id}', 'get'],
            ['/flights/{id}', 'put'],
            ['/flights/{id}/detail', 'get'],
            ['/flights/{id}/assignments', 'get'],
            ['/flights/{id}/assignments', 'post'],
            ['/review/applications/{id}', 'get'],
            ['/review/applications/{id}', 'put'],
            ['/review/applications/{id}/status', 'patch'],
            ['/review/applications/{id}/accept', 'post']
        ];

        for (const [path, method] of operations) {
            const operation = specs.paths[path]?.[method];
            expect(operation, `missing ${method.toUpperCase()} ${path}`).to.be.an('object');
            expect(
                operation.responses?.['400']?.description,
                `${method.toUpperCase()} ${path} 400`
            ).to.include('Invalid document id');
        }
    });

    it('documents generic document writes with an allowlisted type and 400 constraints', () => {
        const schema = specs.components?.schemas?.GenericDocumentWrite;
        expect(schema, 'missing GenericDocumentWrite schema').to.be.an('object');
        expect(schema.required).to.include.members(['_id', 'type']);
        expect(schema.properties.type.enum).to.deep.equal(['Flight', 'Guardian', 'Veteran']);
        expect(schema.description).to.match(/_rev/);
        expect(schema.description).to.match(/_deleted/);
        expect(schema.description).to.match(/design/i);

        const create = specs.paths['/docs']?.post;
        const update = specs.paths['/docs/{id}']?.put;
        const remove = specs.paths['/docs/{id}']?.delete;

        expect(create, 'missing POST /docs').to.be.an('object');
        expect(update, 'missing PUT /docs/{id}').to.be.an('object');
        expect(remove, 'missing DELETE /docs/{id}').to.be.an('object');

        expect(create.security).to.deep.equal([{ GoogleAuth: [] }]);
        expect(create.responses).to.include.all.keys('201', '400', '401', '403', '500', '503');
        expect(update.responses).to.include.all.keys('200', '400', '401', '403', '404', '500', '503');
        expect(remove.responses).to.include.all.keys('200', '400', '401', '403', '404', '500', '503');

        expect(create.requestBody.content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/GenericDocumentWrite');
        expect(update.requestBody.content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/GenericDocumentWrite');

        expect(create.responses['400'].description).to.match(/design or system/i);
        expect(create.responses['400'].description).to.match(/type/i);
        expect(create.responses['400'].description).to.include('Invalid document id');
        expect(update.responses['400'].description).to.match(/match the URL id/i);
        expect(update.responses['400'].description).to.match(/design or system/i);
        expect(remove.responses['400'].description).to.match(/not allowed/i);
    });
});
