import { expect } from 'chai';
import { PassThrough } from 'node:stream';

const runnerHref = '../scripts/maintenance/runner.mjs';

function mockTerminal({ tty = true } = {}) {
    const input = new PassThrough();
    const output = new PassThrough();
    const writes = [];
    input.isTTY = tty;
    output.isTTY = tty;
    const originalWrite = output.write.bind(output);
    output.write = (chunk, encoding, callback) => {
        writes.push(String(chunk));
        return originalWrite(chunk, encoding, callback);
    };
    return { input, output, writes };
}

async function expectCode(promise, code) {
    try {
        await promise;
    } catch (error) {
        expect(error.name).to.equal('MaintenanceError');
        expect(error.code).to.equal(code);
        return error;
    }
    expect.fail(`expected MaintenanceError ${code}`);
}

describe('createMaintenancePrompt', () => {
    it('reads a typed line from the provided stdin stream', async () => {
        const { createMaintenancePrompt } = await import(runnerHref);
        const { input, output, writes } = mockTerminal({ tty: true });
        const prompt = createMaintenancePrompt({ input, output, isTTY: true });
        const question = 'Type the database name to confirm apply to production: hf';
        const pending = prompt(question);
        setImmediate(() => {
            input.push('hf\r\n');
        });
        const answer = await pending;
        expect(answer).to.equal('hf');
        expect(writes.join('')).to.include(question);
    });

    it('accepts a matching database name through confirmApply', async () => {
        const { createMaintenancePrompt, confirmApply } = await import(runnerHref);
        const { input, output } = mockTerminal({ tty: true });
        const prompt = createMaintenancePrompt({ input, output, isTTY: true });
        const pending = confirmApply({
            envName: 'prd',
            apply: true,
            database: 'hf',
            prompt
        });
        setImmediate(() => {
            input.push(' hf \n');
        });
        await pending;
    });

    it('rejects a wrong typed answer through confirmApply', async () => {
        const { createMaintenancePrompt, confirmApply } = await import(runnerHref);
        const { input, output } = mockTerminal({ tty: true });
        const prompt = createMaintenancePrompt({ input, output, isTTY: true });
        const pending = confirmApply({
            envName: 'prd',
            apply: true,
            database: 'hf',
            prompt
        });
        setImmediate(() => {
            input.push('hf-prd\n');
        });
        const error = await expectCode(pending, 'CONFIRMATION_REQUIRED');
        expect(error.message).to.include('did not match');
    });

    it('fails safe when stdin is not a TTY', async () => {
        const { createMaintenancePrompt } = await import(runnerHref);
        const { input, output } = mockTerminal({ tty: false });
        const prompt = createMaintenancePrompt({ input, output, isTTY: false });
        const error = await expectCode(prompt('Confirm: hf'), 'CONFIRMATION_REQUIRED');
        expect(error.message).to.match(/interactive terminal/i);
        expect(error.message).to.match(/TTY/i);
    });

    it('fails safe when stdin closes before a line is entered', async () => {
        const { createMaintenancePrompt, confirmApply } = await import(runnerHref);
        const { input, output } = mockTerminal({ tty: true });
        input.end();
        const prompt = createMaintenancePrompt({ input, output, isTTY: true });
        const error = await expectCode(confirmApply({
            envName: 'prd',
            apply: true,
            database: 'hf',
            prompt
        }), 'CONFIRMATION_REQUIRED');
        expect(error.message).to.match(/did not match|Confirmation was missing/);
    });
});