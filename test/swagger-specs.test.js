import { expect } from 'chai';
import { specs } from '../swagger/swagger.js';
import { ROUTE_PERMISSIONS } from '../utils/permissions.js';

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

        expect(schemas.Error.properties).to.have.property('error');
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

    it('does not document the removed /user/hasgroup probe', () => {
        expect(specs.paths['/user/hasgroup']).to.equal(undefined);
        const description = specs.components.securitySchemes.GoogleAuth.description;
        expect(description).to.match(/nested/i);
        expect(description).to.match(/AUTHZ_ROLE_FULL_GROUPS/);
        expect(description).to.not.match(/hasgroup/i);
        expect(description).to.not.match(/ALLOWED_GROUP_EMAILS/);
        const scopes = specs.components.securitySchemes.GoogleAuth.flows.implicit.scopes;
        expect(Object.keys(scopes)).to.deep.equal(['openid', 'email', 'profile']);
        expect(scopes).to.not.have.property(
            'https://www.googleapis.com/auth/admin.directory.group.readonly'
        );
    });

    it('parses @swagger JSDoc YAML into real path items', () => {
        expect(specs.paths).to.be.an('object');

        for (const path of ['/veterans', '/guardians', '/flights']) {
            expect(specs.paths[path], `missing path ${path}`).to.be.an('object');
            expect(Object.keys(specs.paths[path]).length).to.be.greaterThan(0);
        }
    });

    it('documents 503 when a database session cannot be established', () => {
        const operations = [
            ['/search', 'get'],
            ['/query', 'post'],
            ['/flights', 'get'],
            ['/flights', 'post'],
            ['/flights/{id}', 'get'],
            ['/flights/{id}/detail', 'get'],
            ['/flights/{id}/assignments', 'get'],
            ['/flights/{id}/assignments', 'post'],
            ['/veterans', 'post'],
            ['/veterans/{id}', 'get'],
            ['/veterans/search', 'get'],
            ['/guardians', 'post'],
            ['/guardians/{id}', 'put'],
            ['/docs', 'post'],
            ['/exports/flight', 'get'],
            ['/waitlist', 'get'],
            ['/recent-activity', 'get'],
            ['/review/applications', 'get']
        ];

        for (const [path, method] of operations) {
            const operation = specs.paths[path]?.[method];
            expect(operation, `missing ${method.toUpperCase()} ${path}`).to.be.an('object');
            expect(operation.responses, `${method.toUpperCase()} ${path}`).to.have.property('503');
        }

        expect(specs.paths['/search'].get.responses['503'].description).to.match(/session/i);
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
        expect(create.responses).to.include.all.keys('201', '400', '401', '403', '409', '500', '503');
        expect(update.responses).to.include.all.keys('200', '400', '401', '403', '404', '409', '500', '503');
        expect(remove.responses).to.include.all.keys('200', '400', '401', '403', '404', '409', '500', '503');

        expect(create.requestBody.content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/GenericDocumentWrite');
        expect(update.requestBody.content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/GenericDocumentWrite');

        expect(create.responses['400'].description).to.match(/design or system/i);
        expect(create.responses['400'].description).to.match(/type/i);
        expect(create.responses['400'].description).to.include('Invalid document id');
        expect(update.responses['400'].description).to.match(/match the URL id/i);
        expect(update.responses['400'].description).to.match(/design or system/i);
        expect(update.responses['400'].description).to.match(/match the stored document type/i);
        expect(update.responses['400'].description).to.match(/stored document type is not allowed/i);
        expect(update.responses['400'].description).to.match(/validation/i);
        expect(create.responses['409'].description).to.match(/conflict/i);
        expect(remove.responses['400'].description).to.match(/not allowed/i);
    });

    it('documents partial failure when adding veterans to a flight', () => {
        const post = specs.paths['/flights/{id}/assignments']?.post;
        expect(post, 'missing POST /flights/{id}/assignments').to.be.an('object');
        expect(post.responses).to.include.all.keys('200', '409', '500');

        const conflict = post.responses['409'];
        expect(conflict.description).to.match(/conflict/i);
        expect(conflict.description).to.match(/retry/i);
        expect(conflict.content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/AddVeteransResult');

        const partial = post.responses['500'];
        expect(partial.description).to.match(/saved/i);
        expect(partial.description).to.match(/failed/i);

        const schema = specs.components?.schemas?.AddVeteransResult;
        expect(schema, 'missing AddVeteransResult schema').to.be.an('object');
        expect(schema.properties.saved.properties).to.have.all.keys('veterans', 'guardians');
        expect(schema.properties.saved.properties.veterans.items.type).to.equal('string');
        expect(schema.properties.failed.items.properties).to.include.all.keys('id', 'type', 'status', 'error');
        expect(schema.properties.failed.items.properties.type.enum).to.deep.equal(['veteran', 'guardian']);
        expect(schema.properties.failed.description).to.match(/id/i);
    });

    it('documents UserPermissions and matches x-required-permission to ROUTE_PERMISSIONS', () => {
        const schema = specs.components?.schemas?.UserPermissions;
        expect(schema, 'missing UserPermissions schema').to.be.an('object');
        expect(schema.type).to.equal('object');
        expect(schema.required).to.include.members([
            'email', 'hasAccess', 'roles', 'permissions', 'evaluatedAt', 'expiresAt'
        ]);
        expect(schema.properties.roles.items.enum).to.deep.equal([
            'READ', 'WRITE', 'FULL', 'MEDICAL', 'REVIEW'
        ]);
        expect(schema.properties.hasAccess.type).to.equal('boolean');

        const permissions = specs.paths['/user/permissions']?.get;
        expect(permissions, 'missing GET /user/permissions').to.be.an('object');
        expect(permissions.security).to.deep.equal([{ GoogleAuth: [] }]);
        expect(permissions['x-required-permission']).to.equal(undefined);
        expect(permissions.responses).to.include.all.keys('200', '401', '403', '503');
        expect(permissions.responses['200'].content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/UserPermissions');
        expect(JSON.stringify(permissions.responses['200'].headers)).to.match(/no-store/);

        function openApiPath(expressPath) {
            return expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        }

        const documented = new Set();
        for (const [key, required] of Object.entries(ROUTE_PERMISSIONS)) {
            const space = key.indexOf(' ');
            const method = key.slice(0, space).toLowerCase();
            const path = openApiPath(key.slice(space + 1));
            const operation = specs.paths[path]?.[method];
            expect(operation, `missing OpenAPI operation ${key}`).to.be.an('object');
            const extension = operation['x-required-permission'];
            const documentedPermissions = Array.isArray(extension) ? extension : [extension];
            expect(documentedPermissions, key).to.deep.equal([...required]);
            expect(operation.responses, key).to.have.property('403');
            documented.add(`${method.toUpperCase()} ${path}`);
        }

        const publicOperations = new Set([
            'POST /review/applications',
            'GET /user/permissions'
        ]);
        for (const [path, methods] of Object.entries(specs.paths)) {
            for (const [method, operation] of Object.entries(methods)) {
                if (!operation || typeof operation !== 'object' || !operation.responses) {
                    continue;
                }
                const key = `${method.toUpperCase()} ${path}`;
                if (publicOperations.has(key)) {
                    expect(operation['x-required-permission'], key).to.equal(undefined);
                    continue;
                }
                expect(documented.has(key), `OpenAPI operation ${key} is not in ROUTE_PERMISSIONS`).to.equal(true);
            }
        }
    });

    it('documents the flight status utility endpoints', () => {
        const complete = specs.paths['/flights/{id}/complete']?.post;
        const activate = specs.paths['/flights/future-status/activate']?.post;
        expect(complete, 'missing POST /flights/{id}/complete').to.be.an('object');
        expect(activate, 'missing POST /flights/future-status/activate').to.be.an('object');

        expect(complete['x-required-permission']).to.equal('flights:manage');
        expect(activate['x-required-permission']).to.equal('flights:manage');
        expect(complete.responses).to.include.all.keys(
            '200', '207', '400', '401', '403', '404', '409', '500', '503'
        );
        expect(activate.responses).to.include.all.keys('200', '207', '400', '401', '403', '500', '503');
        expect(complete.responses['400'].description).to.include('Invalid document id');

        const result = specs.components?.schemas?.FlightStatusBulkResult;
        expect(result, 'missing FlightStatusBulkResult schema').to.be.an('object');
        expect(result.properties.assignedToFlight.type).to.equal('array');
        expect(result.properties.assignedToFlight.items.type).to.equal('string');
        expect(result.properties.failed.items.properties).to.include.all.keys('id', 'type', 'status', 'error');
        expect(result.properties.failed.items.properties.type.enum).to.include.members([
            'veteran', 'guardian', 'flight'
        ]);

        const request = specs.components?.schemas?.FutureStatusActivateRequest;
        expect(request, 'missing FutureStatusActivateRequest schema').to.be.an('object');
        expect(request.required).to.deep.equal(['status']);
        expect(request.properties.status.pattern).to.equal('^Future-.+');

        expect(complete.responses['200'].content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/FlightStatusBulkResult');
        expect(activate.requestBody.content['application/json'].schema.$ref)
            .to.equal('#/components/schemas/FutureStatusActivateRequest');
    });
});
