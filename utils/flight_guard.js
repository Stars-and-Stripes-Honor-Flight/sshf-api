/**
 * Return whether a stored flight document is completed.
 * Legacy records may store the string "true" instead of a boolean.
 *
 * @param {{ completed?: unknown } | null | undefined} flightDoc
 * @returns {boolean}
 */
export function isFlightCompleted(flightDoc) {
    const completed = flightDoc?.completed;
    return completed === true || completed === 'true';
}
