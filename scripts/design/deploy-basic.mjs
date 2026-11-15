import 'dotenv/config';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirectRun } from '../../utils/direct_run.js';
import {
    confirmApply,
    createMaintenancePrompt,
    resolveMaintTarget,
    writeBackup
} from '../maintenance/runner.mjs';
import { MaintenanceError } from '../maintenance/errors.mjs';
import { buildDesignDoc, DESIGN_DOC_ID } from './build.mjs';
import { createDesignDeployDb } from './couch.mjs';
import { diffDesignDocs, formatDesignFunctionDiffs } from './diff.mjs';

export const DEPLOY_SCRIPT_NAME = 'deploy-design-basic';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const KNOWN_DESIGNS = new Set(['basic', 'hf-app-review']);
const DESIGN_DOC_IDS = {
    basic: '_design/basic',
    'hf-app-review': '_design/hf-app-review'
};
const DESIGN_SOURCE_DIRS = {
    basic: path.join(repoRoot, 'couchdb', 'design', 'basic'),
    'hf-app-review': path.join(repoRoot, 'couchdb', 'design', 'hf-app-review')
};
const BACKUP_SCRIPT_NAMES = {
    basic: 'deploy-design-basic',
    'hf-app-review': 'deploy-design-hf-app-review'
};

const REJECTED_FLAGS = new Set([
    '--yes',
    '--force',
    '--no-confirm',
    '--skip-confirm',
    '--assume-yes',
    '-y',
    '--confirm',
    '--db'
]);

const DESIGN_EXPECTED = 'Unknown design. Expected --design basic or --design hf-app-review.';

function joinNames(names) {
    return names.length > 0 ? names.join(', ') : 'none';
}

function unknownDesignMessage(value) {
    return `Unknown design ${value}. Expected --design basic or --design hf-app-review.`;
}

export function parseDesignDeployArgs(argv = []) {
    let apply = false;
    let env;
    let envSpecified = false;
    let design;
    let designSpecified = false;

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
        if (token === '--design' || token.startsWith('--design=')) {
            if (designSpecified) {
                throw new MaintenanceError('Duplicate --design flag.', { code: 'USAGE' });
            }
            const value = token.startsWith('--design=') ? token.slice('--design='.length) : argv[index + 1];
            if (token === '--design') {
                index += 1;
            }
            if (!value) {
                throw new MaintenanceError(DESIGN_EXPECTED, { code: 'USAGE' });
            }
            if (!KNOWN_DESIGNS.has(value)) {
                throw new MaintenanceError(unknownDesignMessage(value), { code: 'USAGE' });
            }
            design = value;
            designSpecified = true;
            continue;
        }
        if (token.startsWith('--')) {
            if (REJECTED_FLAGS.has(token)) {
                throw new MaintenanceError(`Unknown flag ${token}.`, { code: 'USAGE' });
            }
            throw new MaintenanceError(`Unknown flag ${token}.`, { code: 'USAGE' });
        }
        throw new MaintenanceError('Too many arguments.', { code: 'USAGE' });
    }

    if (apply && !envSpecified) {
        throw new MaintenanceError('--apply requires --env dev or --env prd.', { code: 'USAGE' });
    }

    const result = {
        apply: apply === true,
        env: env || 'dev'
    };
    if (designSpecified) {
        result.design = design;
    }
    return result;
}

function assertDistinctReviewDatabases(env) {
    const devName = typeof env.DEV_REVIEW_DB_NAME === 'string' ? env.DEV_REVIEW_DB_NAME.trim() : '';
    const prdName = typeof env.PRD_REVIEW_DB_NAME === 'string' ? env.PRD_REVIEW_DB_NAME.trim() : '';
    if (devName && prdName && devName === prdName) {
        throw new MaintenanceError(
            'DEV_REVIEW_DB_NAME and PRD_REVIEW_DB_NAME must name different databases.',
            { code: 'CONFIG' }
        );
    }
}

function reviewDatabaseForEnv(envName, env) {
    if (envName === 'dev') {
        const database = typeof env.DEV_REVIEW_DB_NAME === 'string' ? env.DEV_REVIEW_DB_NAME.trim() : '';
        if (!database) {
            throw new MaintenanceError(
                'DEV_REVIEW_DB_NAME is required for --design hf-app-review --env dev.',
                { code: 'CONFIG' }
            );
        }
        return database;
    }
    if (envName === 'prd') {
        const database = typeof env.PRD_REVIEW_DB_NAME === 'string' ? env.PRD_REVIEW_DB_NAME.trim() : '';
        if (!database) {
            throw new MaintenanceError(
                'PRD_REVIEW_DB_NAME is required for --design hf-app-review --env prd.',
                { code: 'CONFIG' }
            );
        }
        return database;
    }
    throw new MaintenanceError('Invalid --env value.', { code: 'USAGE' });
}

export function resolveReviewTarget({ envName, env = process.env } = {}) {
    if (envName !== 'dev' && envName !== 'prd') {
        throw new MaintenanceError('Invalid --env value.', { code: 'USAGE' });
    }
    assertDistinctReviewDatabases(env);
    const rawUrl = env.REVIEW_DB_URL || env.DB_URL;
    const url = typeof rawUrl === 'string' ? rawUrl.replace(/\/+$/, '') : '';
    const user = env.REVIEW_DB_USER || env.DB_USER;
    const pass = env.REVIEW_DB_PASS || env.DB_PASS;
    const database = reviewDatabaseForEnv(envName, env);
    if (!url || !user || !pass) {
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
        url,
        user,
        pass
    };
}

export function formatDesignDeployReport(result) {
    return [
        `design: ${result.design}`,
        `env: ${result.env}`,
        `host: ${result.host}`,
        `database: ${result.database}`,
        `dryRun: ${result.dryRun}`,
        `equivalent: ${result.equivalent}`,
        `languageChanged: ${result.languageChanged}`,
        `viewsAdded: ${joinNames(result.viewsAdded)}`,
        `viewsChanged: ${joinNames(result.viewsChanged)}`,
        `viewsKept: ${joinNames(result.viewsKept)}`,
        `viewsRemoved: ${joinNames(result.viewsRemoved)}`,
        `listsAdded: ${joinNames(result.listsAdded)}`,
        `listsChanged: ${joinNames(result.listsChanged)}`,
        `listsKept: ${joinNames(result.listsKept)}`,
        `listsRemoved: ${joinNames(result.listsRemoved)}`,
        `keysRemoved: ${joinNames(result.keysRemoved)}`,
        `attachmentsRemoved: ${joinNames(result.attachmentsRemoved)}`,
        `changed: ${result.changed}`,
        `conflicts: ${result.conflicts}`,
        `backup: ${result.backupPath || 'none'}`
    ].join('\n');
}

function formatDryRunHeader({ designDocId, envName, database, defaulted }) {
    const lines = [
        'DRY RUN — nothing will be written.',
        `Design document: ${designDocId}`,
        `Environment: ${envName}`,
        `Database: ${database}`
    ];
    if (defaulted) {
        lines.push('No --env was provided; defaulted to dev.');
    }
    return lines.join('\n');
}

function formatDryRunSummary(diff) {
    return [
        'Summary:',
        `views added ${diff.viewsAdded.length}, changed ${diff.viewsChanged.length}, removed ${diff.viewsRemoved.length};`,
        `lists added ${diff.listsAdded.length}, changed ${diff.listsChanged.length}, removed ${diff.listsRemoved.length};`,
        `top-level keys removed ${diff.keysRemoved.length};`,
        `attachments removed ${diff.attachmentsRemoved.length}`
    ].join(' ');
}

function formatDryRunHint(envName) {
    return `To deploy, rerun with --apply --env ${envName}.`;
}

function attachmentMissingData(liveDoc) {
    if (!liveDoc?._attachments || typeof liveDoc._attachments !== 'object') {
        return null;
    }
    for (const [name, meta] of Object.entries(liveDoc._attachments)) {
        if (typeof meta?.data !== 'string') {
            return name;
        }
    }
    return null;
}

function buildPutBody(repoDoc, liveDoc) {
    const body = {
        _id: repoDoc._id,
        language: repoDoc.language,
        views: repoDoc.views
    };
    if (repoDoc.lists !== undefined) {
        body.lists = repoDoc.lists;
    }
    if (liveDoc?._rev) {
        body._rev = liveDoc._rev;
    }
    return body;
}

export async function runDesignDeploy(argv, deps = {}) {
    const log = deps.log || (() => {});
    const now = deps.now || (() => new Date());
    const env = deps.env || process.env;
    const pathImpl = deps.pathImpl || path;
    const rootDir = deps.rootDir ?? repoRoot;
    const parsed = parseDesignDeployArgs(argv);
    const designKey = parsed.design ?? 'basic';
    const designDocId = DESIGN_DOC_IDS[designKey];
    const backupScriptName = BACKUP_SCRIPT_NAMES[designKey];
    const sourceDir = deps.sourceDir ?? DESIGN_SOURCE_DIRS[designKey];
    const sourceFs = deps.sourceFs ?? { readdirSync, statSync, readFileSync, existsSync };
    const envSpecified = argv.some((token) => token === '--env' || token.startsWith('--env='));
    const target = designKey === 'hf-app-review'
        ? resolveReviewTarget({ envName: parsed.env, env })
        : resolveMaintTarget({ envName: parsed.env, env });

    const builder = deps.buildDesignDoc
        ?? ((dir) => buildDesignDoc(dir, { fs: sourceFs, pathImpl, design: designKey }));
    let repoDoc;
    try {
        repoDoc = builder(sourceDir);
    } catch (error) {
        if (error instanceof MaintenanceError) {
            throw error;
        }
        throw new MaintenanceError(error?.message || 'Invalid design source.', { code: 'INVALID_SOURCE' });
    }

    const prompt = deps.prompt ?? (
        parsed.apply && target.envName === 'prd'
            ? createMaintenancePrompt({
                input: deps.stdin,
                output: deps.stdout,
                isTTY: deps.isTTY
            })
            : undefined
    );

    await confirmApply({
        envName: target.envName,
        apply: parsed.apply,
        database: target.database,
        prompt
    });

    const db = deps.db || (deps.createDb
        ? deps.createDb(target)
        : createDesignDeployDb({
            url: target.url,
            name: target.database,
            user: target.user,
            pass: target.pass,
            fetchImpl: deps.fetchImpl
        }));

    const liveDoc = await db.getDesignDoc(designDocId);
    const diff = diffDesignDocs(repoDoc, liveDoc);

    const dryRun = !parsed.apply;
    if (dryRun) {
        log(formatDryRunHeader({
            designDocId,
            envName: target.envName,
            database: target.database,
            defaulted: !envSpecified
        }));
    }

    log(`Target host=${target.host} database=${target.database} env=${target.envName}`);

    let changed = 0;
    let conflicts = 0;
    let conflictIds = [];
    let backupPath = null;

    if (parsed.apply && !diff.equivalent) {
        const incomplete = attachmentMissingData(liveDoc);
        if (incomplete) {
            throw new MaintenanceError(
                `Live attachment ${incomplete} is missing inline data; cannot back up safely.`,
                { code: 'INCOMPLETE_BACKUP' }
            );
        }

        if (liveDoc) {
            try {
                backupPath = deps.writeBackup
                    ? await deps.writeBackup({
                        rootDir,
                        scriptName: backupScriptName,
                        date: now(),
                        documents: [liveDoc],
                        meta: {
                            env: target.envName,
                            host: target.host,
                            database: target.database
                        },
                        fs: deps.fs ?? { mkdir, writeFile },
                        pathImpl
                    })
                    : await writeBackup({
                        rootDir,
                        scriptName: backupScriptName,
                        date: now(),
                        documents: [liveDoc],
                        meta: {
                            env: target.envName,
                            host: target.host,
                            database: target.database
                        },
                        fs: deps.fs ?? { mkdir, writeFile },
                        pathImpl
                    });
            } catch (error) {
                throw new MaintenanceError(error?.message || 'Backup failed.', { code: 'BACKUP_FAILED' });
            }
        }

        const putResult = await db.putDesignDoc(buildPutBody(repoDoc, liveDoc));
        if (putResult?.ok === false && putResult.error === 'conflict') {
            conflicts = 1;
            conflictIds = [designDocId];
        } else if (putResult?.ok) {
            changed = 1;
        }
    }

    const result = {
        design: designDocId,
        dryRun,
        env: target.envName,
        host: target.host,
        database: target.database,
        equivalent: diff.equivalent,
        languageChanged: diff.languageChanged,
        viewsAdded: diff.viewsAdded,
        viewsChanged: diff.viewsChanged,
        viewsKept: diff.viewsKept,
        viewsRemoved: diff.viewsRemoved,
        listsAdded: diff.listsAdded,
        listsChanged: diff.listsChanged,
        listsKept: diff.listsKept,
        listsRemoved: diff.listsRemoved,
        keysRemoved: diff.keysRemoved,
        attachmentsRemoved: diff.attachmentsRemoved,
        changed,
        conflicts,
        conflictIds,
        backupPath
    };

    log(formatDesignDeployReport(result));

    if (dryRun) {
        for (const line of formatDesignFunctionDiffs(repoDoc, liveDoc, diff)) {
            log(line);
        }
        log(formatDryRunSummary(diff));
        log(formatDryRunHint(target.envName));
    }

    return result;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
    runDesignDeploy(process.argv.slice(2), { log: (line) => console.log(line) })
        .catch((error) => {
            if (error instanceof MaintenanceError) {
                console.error(error.message);
            } else {
                console.error(error instanceof Error ? error.message : String(error));
            }
            process.exitCode = 1;
        });
}