import { expect } from 'chai';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { specs } from '../swagger/swagger.js';

describe('removed legacy probe routes (#100, #107)', () => {
    it('does not register /msg or /secure-data in index.js', () => {
        const indexSource = readFileSync(join(process.cwd(), 'index.js'), 'utf8');
        expect(indexSource).to.not.include("app.get('/secure-data'");
        expect(indexSource).to.not.include('app.get("/msg"');
        expect(indexSource).to.not.include('app.post("/msg"');
        expect(indexSource).to.not.include('./routes/msg.js');
        expect(indexSource).to.not.include('./routes/secure.js');
    });

    it('does not document /msg or /secure-data in OpenAPI', () => {
        expect(specs.paths['/msg']).to.equal(undefined);
        expect(specs.paths['/secure-data']).to.equal(undefined);
    });

    it('removes legacy route and model modules', () => {
        expect(existsSync(join(process.cwd(), 'routes/msg.js'))).to.equal(false);
        expect(existsSync(join(process.cwd(), 'routes/secure.js'))).to.equal(false);
        expect(existsSync(join(process.cwd(), 'models/message.js'))).to.equal(false);
    });

    it('does not send CouchDB credentials via Authorization Basic from route handlers', () => {
        const routesDir = join(process.cwd(), 'routes');
        for (const file of readdirSync(routesDir).filter((name) => name.endsWith('.js'))) {
            const source = readFileSync(join(routesDir, file), 'utf8');
            expect(source, `${file} must not use Basic auth for CouchDB`).to.not.match(
                /Authorization['`]\s*:\s*[`'"]Basic/
            );
        }
    });
});
