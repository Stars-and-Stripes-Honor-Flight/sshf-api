import { expect } from 'chai';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirectRun } from '../utils/direct_run.js';

const indexPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.js');

describe('isDirectRun', () => {
    it('matches a Windows entry path to the file URL for that module', () => {
        const argvPath = 'C:\\Users\\steve\\Repos\\sshf-api\\index.js';
        const metaUrl = 'file:///C:/Users/steve/Repos/sshf-api/index.js';

        expect(`file://${argvPath}`).to.not.equal(metaUrl);
        expect(isDirectRun(metaUrl, argvPath, { windows: true })).to.equal(true);
    });

    it('matches a Linux entry path to the file URL for that module', () => {
        const argvPath = '/home/steve/Repos/sshf-api/index.js';
        const metaUrl = 'file:///home/steve/Repos/sshf-api/index.js';

        expect(isDirectRun(metaUrl, argvPath, { windows: false })).to.equal(true);
    });

    it('returns false when another file was launched', () => {
        expect(isDirectRun(
            'file:///home/steve/Repos/sshf-api/index.js',
            '/home/steve/Repos/sshf-api/test/index.test.js',
            { windows: false }
        )).to.equal(false);
    });

    it('returns false when the entry path is missing', () => {
        const metaUrl = 'file:///home/steve/Repos/sshf-api/index.js';

        expect(isDirectRun(metaUrl, undefined)).to.equal(false);
        expect(isDirectRun(metaUrl, '')).to.equal(false);
    });

    it('encodes spaces the same way import.meta.url does', () => {
        expect(isDirectRun(
            'file:///tmp/my%20index.js',
            '/tmp/my index.js',
            { windows: false }
        )).to.equal(true);
    });

    it('matches this platform entry path for index.js', () => {
        expect(isDirectRun(pathToFileURL(indexPath).href, indexPath)).to.equal(true);
    });
});
