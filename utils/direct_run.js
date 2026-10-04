import { pathToFileURL } from 'node:url';

/**
 * True when metaUrl is the module Node was asked to run.
 * pathToFileURL produces the same file URL as import.meta.url on Windows and Linux.
 *
 * @param {string} metaUrl import.meta.url of the module
 * @param {string | undefined} argvPath process.argv[1]
 * @param {{ windows?: boolean }} [options] path style; omit to use the current OS
 * @returns {boolean}
 */
export function isDirectRun(metaUrl, argvPath, options) {
    if (typeof metaUrl !== 'string' || typeof argvPath !== 'string' || argvPath.length === 0) {
        return false;
    }
    return metaUrl === pathToFileURL(argvPath, options).href;
}
