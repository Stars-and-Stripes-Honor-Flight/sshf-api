import { expect } from 'chai';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { specs } from '../swagger/swagger.js';

const PROBE_ROUTE = /\.(?:get|post|put|patch|delete)\(\s*['"`]\/(?:msg|secure-data)(?:\/|['"`])/;
const BASIC_AUTH_HEADER = /Authorization['"`]?\]?\s*[:=]\s*['"`]Basic\b/;

function javascriptFilesUnder(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...javascriptFilesUnder(path));
        } else if (entry.name.endsWith('.js')) {
            files.push(path);
        }
    }
    return files;
}

describe('removed legacy probe routes (#100, #107)', () => {
    const sources = [
        join(process.cwd(), 'index.js'),
        ...javascriptFilesUnder(join(process.cwd(), 'routes'))
    ];

    it('does not register /msg or /secure-data from index.js or route modules', () => {
        const indexSource = readFileSync(join(process.cwd(), 'index.js'), 'utf8');
        expect(indexSource).to.not.include('./routes/msg.js');
        expect(indexSource).to.not.include('./routes/secure.js');

        for (const path of sources) {
            const source = readFileSync(path, 'utf8');
            expect(source, `${path} must not register /msg or /secure-data`).to.not.match(PROBE_ROUTE);
        }
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
        for (const path of javascriptFilesUnder(join(process.cwd(), 'routes'))) {
            const source = readFileSync(path, 'utf8');
            expect(source, `${path} must not use Basic auth for CouchDB`).to.not.match(BASIC_AUTH_HEADER);
        }
    });
});
