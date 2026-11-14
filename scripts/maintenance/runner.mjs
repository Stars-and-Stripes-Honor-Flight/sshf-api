import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BULK_BATCH_SIZE } from '../../utils/bulk_docs.js';
import { isDirectRun } from '../../utils/direct_run.js';
import { createCouchMaintenanceDb } from './couch.mjs';
import { MaintenanceError } from './errors.mjs';

const SCRIPT_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultScriptsDir = path.join(repoRoot, 'scripts', 'maintenance');

export const MAINT_BULK_BATCH_SIZE = BULK_BATCH_SIZE;

export function parseMaintArgs(argv = []) {
    let scriptName;
    let apply = false;
    let env;
    let envSpecified = false;

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--apply') {
            if (apply) {
                throw new MaintenanceError('Duplicate --apply flag.', { code: 'USAGE' });
            }
            apply = true;
            continue;
        }
        if (token === '--env' || token.startsWith('--env=')) {
            if (envSpecified) {
                throw new MaintenanceError('Duplicate --env flag.', { code: 'USAGE' });
            }
            const value = token.startsWith('--env=') ? token.slice('--env='.length) : argv[index + 1];
            if (token === '--env') {
                index += 1;
            }
            if (!value || (value !== 'dev' && value !== 'prd')) {
                throw new MaintenanceError('Invalid --env value.', { code: 'USAGE' });
            }
            env = value;
            envSpecified = true;
            continue;
        }
        if (token.startsWith('--')) {
            throw new MaintenanceError(`Unknown flag ${token}.`, { code: 'USAGE' });
        }
        if (scriptName) {
            throw new MaintenanceError('Too many arguments.', { code: 'USAGE' });
        }
        scriptName = normalizeScriptName(token);
    }

    if (!scriptName) {
        throw new MaintenanceError('A script name is required.', { code: 'USAGE' });
    }
    if (apply && !envSpecified) {
        throw new MaintenanceError('--apply requires --env dev or --env prd.', { code: 'USAGE' });
    }
  return {
    scriptName,
    apply,
    env: env || 'dev'
  };
}

function normalizeScriptName(token) {
    const trimmed = String(token || '').trim();
    const withoutMjs = trimmed.endsWith('.mjs') ? trimmed.slice(0, -4) : trimmed;
    if (!SCRIPT_PATTERN.test(withoutMjs) || withoutMjs.endsWith('.js')) {
        throw new MaintenanceError('Invalid script name.', { code: 'USAGE' });
    }
    if (/[\\/]/.test(withoutMjs) || withoutMjs.includes('..')) {
        throw new MaintenanceError('Invalid script name.', { code: 'USAGE' });
    }
    return withoutMjs;
}

function databaseForEnv(envName, env) {
    if (envName === 'dev') {
        return env.DEV_DB_NAME || env.DB_NAME;
    }
    if (envName === 'prd') {
        return env.PRD_DB_NAME || env.DB_NAME;
    }
    throw new MaintenanceError('Invalid --env value.', { code: 'USAGE' });
}

export function resolveMaintTarget({ envName, env = process.env } = {}) {
    if (envName !== 'dev' && envName !== 'prd') {
        throw new MaintenanceError('Invalid --env value.', { code: 'USAGE' });
    }
    const url = env.DB_URL;
    const user = env.DB_USER;
    const pass = env.DB_PASS;
    const database = databaseForEnv(envName, env);
    if (!url || !user || !pass || !database) {
        throw new MaintenanceError('Database configuration is incomplete.', { code: 'CONFIG' });
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new MaintenanceError('Database configuration is incomplete.', { code: 'CONFIG' });
    }
    return {
        envName,
        host: parsed.host,
        database,
        url: url.replace(/\/+$/, ''),
        user,
        pass
    };
}

export async function confirmApply({ envName, apply, database, prompt } = {}) {
    if (!apply || envName !== 'prd') {
        return;
    }
    if (typeof prompt !== 'function') {
        throw new MaintenanceError('Confirmation was missing.', { code: 'CONFIRMATION_REQUIRED' });
    }
    const answer = await prompt(`Type the database name to confirm apply to production: ${database}`);
    const normalized = typeof answer === 'string' ? answer.trim() : '';
    if (normalized !== database) {
        throw new MaintenanceError('Confirmation did not match the database name.', {
            code: 'CONFIRMATION_REQUIRED'
        });
    }
}

export function backupFileName(scriptName, date = new Date()) {
    const stamp = date.toISOString().replace(/:/g, '');
    return `${scriptName}-${stamp}.json`;
}

export function backupPath(rootDir, scriptName, date, pathImpl = path) {
    return pathImpl.join(rootDir, 'maintenance-backups', backupFileName(scriptName, date));
}

export async function writeBackup({
    rootDir = repoRoot,
    scriptName,
    date = new Date(),
    documents,
    meta = {},
    fs = { mkdir, writeFile },
    pathImpl = path
} = {}) {
    const directory = pathImpl.join(rootDir, 'maintenance-backups');
    const filePath = pathImpl.join(directory, backupFileName(scriptName, date));
    await fs.mkdir(directory, { recursive: true });
    const payload = {
        script: scriptName,
        createdAt: date.toISOString(),
        env: meta.env,
        host: meta.host,
        database: meta.database,
        documents
    };
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return filePath;
}

export async function writeBulkDocs({ docs, bulkDocs, batchSize = MAINT_BULK_BATCH_SIZE } = {}) {
    const saved = [];
    const conflicts = [];
    const failed = [];
    if (!Array.isArray(docs) || docs.length === 0) {
        return { saved, conflicts, failed };
    }
    for (const doc of docs) {
        if (!doc?._rev) {
            throw new MaintenanceError('A planned write is missing _rev.', { code: 'INVALID_SCRIPT' });
        }
    }

    for (let index = 0; index < docs.length; index += batchSize) {
        const batch = docs.slice(index, index + batchSize);
        const results = await bulkDocs(batch);
        for (let position = 0; position < batch.length; position += 1) {
            const doc = batch[position];
            const result = Array.isArray(results) ? results[position] : undefined;
            if (result?.ok) {
                saved.push({ id: result.id || doc._id, rev: result.rev });
                continue;
            }
            if (result?.error === 'conflict') {
                conflicts.push({ id: result.id || doc._id, error: 'conflict' });
                continue;
            }
            failed.push({
                id: result?.id || doc._id,
                error: result?.error || 'error'
            });
        }
    }

    return { saved, conflicts, failed };
}

export function resolveScriptPath(scriptsDir, scriptName, pathImpl = path) {
    const name = normalizeScriptName(scriptName);
    if (name.includes('..') || /[\\/]/.test(scriptName)) {
        throw new MaintenanceError('Invalid script name.', { code: 'USAGE' });
    }
    return pathImpl.join(scriptsDir, `${name}.mjs`);
}

export async function loadMaintenanceScript(scriptName, {
    scriptsDir = defaultScriptsDir,
    importModule = (url) => import(url),
    pathImpl = path
} = {}) {
    const filePath = resolveScriptPath(scriptsDir, scriptName, pathImpl);
    let module;
    try {
        module = await importModule(pathToFileURL(filePath).href);
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            throw new MaintenanceError('Unknown maintenance script.', { code: 'UNKNOWN_SCRIPT' });
        }
        throw error;
    }
    const resolvedName = module.SCRIPT_NAME || module.name || module.default?.name;
    const plan = module.plan || module.default?.plan;
    if (typeof plan !== 'function') {
        throw new MaintenanceError('Script does not export plan.', { code: 'INVALID_SCRIPT' });
    }
    if (resolvedName !== scriptName) {
        throw new MaintenanceError('Script name does not match its module.', { code: 'INVALID_SCRIPT' });
    }
    return { name: resolvedName, plan };
}

function joinIds(items) {
    return items.length > 0 ? items.join(', ') : 'none';
}

export function formatSummary(result) {
    return [
        `script: ${result.script}`,
        `env: ${result.env}`,
        `host: ${result.host}`,
        `database: ${result.database}`,
        `dryRun: ${result.dryRun}`,
        `matched: ${result.matched}`,
        `changed: ${result.changed}`,
        `skipped: ${result.skipped}`,
        `conflicts: ${result.conflicts}`,
        `failed: ${result.failed}`,
        `flagged: ${result.flagged}`,
        `flaggedIds: ${joinIds(result.flaggedIds || [])}`,
        `sample: ${joinIds((result.sample || []).map((item) => item.id))}`,
        `backup: ${result.backupPath || 'none'}`
    ].join('\n');
}

function validatePlan(plan) {
    const writes = plan?.writes || [];
    const originals = plan?.originals || [];
    if (writes.length !== originals.length) {
        throw new MaintenanceError('Script plan originals do not match writes.', { code: 'INVALID_SCRIPT' });
    }
    for (const write of writes) {
        if (!write?._rev || write._deleted !== true) {
            throw new MaintenanceError('Script plan writes must include _rev and _deleted.', {
                code: 'INVALID_SCRIPT'
            });
        }
    }
}

export async function runMaintenance(argv, deps = {}) {
    const log = deps.log || (() => {});
    const now = deps.now || (() => new Date());
    const env = deps.env || process.env;
    const parsed = parseMaintArgs(argv);
    const target = resolveMaintTarget({ envName: parsed.env, env });
    const script = deps.loadScript
        ? await deps.loadScript(parsed.scriptName)
        : await loadMaintenanceScript(parsed.scriptName);
    const dryRun = !parsed.apply;

    log(`Target host=${target.host} database=${target.database} env=${target.envName}`);

    await confirmApply({
        envName: target.envName,
        apply: parsed.apply,
        database: target.database,
        prompt: deps.prompt
    });

    const db = deps.db || (deps.createDb
        ? deps.createDb(target)
        : createCouchMaintenanceDb({
            url: target.url,
            name: target.database,
            user: target.user,
            pass: target.pass,
            fetchImpl: deps.fetchImpl
        }));

    const plan = await script.plan(db);
    validatePlan(plan);

    const flaggedIds = (plan.flagged || []).map((item) => item.id);
    let changed = 0;
    let conflicts = 0;
    let failed = 0;
    let conflictIds = [];
    let failedIds = [];
    let backupPath = null;

    if (parsed.apply && plan.writes.length > 0) {
        try {
            backupPath = deps.writeBackup
                ? await deps.writeBackup({
                    rootDir: deps.rootDir,
                    scriptName: script.name,
                    date: now(),
                    documents: plan.originals,
                    meta: {
                        env: target.envName,
                        host: target.host,
                        database: target.database
                    },
                    fs: deps.fs,
                    pathImpl: deps.pathImpl
                })
                : await writeBackup({
                    rootDir: deps.rootDir,
                    scriptName: script.name,
                    date: now(),
                    documents: plan.originals,
                    meta: {
                        env: target.envName,
                        host: target.host,
                        database: target.database
                    },
                    fs: deps.fs,
                    pathImpl: deps.pathImpl
                });
        } catch (error) {
            throw new MaintenanceError(error?.message || 'Backup failed.', { code: 'BACKUP_FAILED' });
        }

        const bulkResult = await writeBulkDocs({
            docs: plan.writes,
            bulkDocs: (batch) => db.bulkDocs(batch),
            batchSize: MAINT_BULK_BATCH_SIZE
        });
        changed = bulkResult.saved.length;
        conflicts = bulkResult.conflicts.length;
        failed = bulkResult.failed.length;
        conflictIds = bulkResult.conflicts.map((item) => item.id);
        failedIds = bulkResult.failed.map((item) => item.id);
    }

    const result = {
        dryRun,
        script: script.name,
        env: target.envName,
        host: target.host,
        database: target.database,
        matched: plan.matched ?? 0,
        changed,
        skipped: plan.skipped?.length ?? 0,
        conflicts,
        failed,
        flagged: plan.flagged?.length ?? 0,
        sample: plan.sample || [],
        flaggedIds,
        conflictIds,
        failedIds,
        backupPath
    };

    log(formatSummary(result));
    return result;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
    runMaintenance(process.argv.slice(2), { log: (line) => console.log(line) })
        .catch((error) => {
            if (error instanceof MaintenanceError) {
                console.error(error.message);
            } else {
                console.error(error instanceof Error ? error.message : String(error));
            }
            process.exitCode = 1;
        });
}