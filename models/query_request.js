/**
 * QueryRequest model
 * Validates and normalizes CouchDB Mango _find query requests
 */

// Allowlisted top-level keys for _find requests
const ALLOWED_KEYS = [
    'selector',
    'fields',
    'sort',
    'limit',
    'bookmark',
    'use_index',
    'execution_stats'
];

// Denied keys that indicate mutation or bulk operations
const DENIED_KEYS = [
    'skip',        // expensive full-scan pagination
    'remove',      // mutation
    'bulk',        // bulk operations
    'docs',        // bulk payload
    'new_edits',   // bulk write control
    'index',       // index creation
    'ddoc',        // design doc for index creation
    'type',        // index type for creation (as top-level key)
    'map',         // map/reduce
    'reduce',      // map/reduce
    'views',       // design doc views
    'update'       // we force this to false, don't allow user override
];

// Denied operators that indicate mutation (recursive check)
const DENIED_OPERATORS = [
    '$set',
    '$update',
    '$unset',
    '$inc',
    '$push',
    '$pull'
];

export class QueryRequest {
    static DEFAULT_LIMIT = 25;
    static MAX_LIMIT = 100;
    static MIN_LIMIT = 1;

    constructor(data = {}) {
        this.selector = data.selector;
        this.fields = data.fields;
        this.sort = data.sort;
        this.limit = data.limit;
        this.bookmark = data.bookmark;
        this.use_index = data.use_index;
        this.execution_stats = data.execution_stats;

        // Validate and normalize
        this.validateAndNormalize(data);
    }

    validateAndNormalize(data) {
        // Check for denied keys first (before unknown keys check)
        const dataKeys = Object.keys(data);
        const deniedKeys = dataKeys.filter(key => DENIED_KEYS.includes(key));
        if (deniedKeys.length > 0) {
            throw new Error(`Validation failed: forbidden keys detected: ${deniedKeys.join(', ')}`);
        }

        // Check for unknown keys
        const unknownKeys = dataKeys.filter(key => !ALLOWED_KEYS.includes(key));
        if (unknownKeys.length > 0) {
            throw new Error(`Validation failed: unknown keys not allowed: ${unknownKeys.join(', ')}`);
        }

        // Selector is required
        if (this.selector === undefined) {
            throw new Error('Validation failed: selector is required');
        }

        // Selector must be an object (not null, not array)
        if (typeof this.selector !== 'object' || Array.isArray(this.selector) || this.selector === null) {
            throw new Error('Validation failed: selector must be an object');
        }

        // Recursively check for mutation operators in the entire request body
        this.checkForMutationOperators(data);

        // Normalize limit
        this.normalizeLimit();
    }

    checkForMutationOperators(obj, path = '') {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }

        for (const [key, value] of Object.entries(obj)) {
            // Check if this key is a denied operator
            if (DENIED_OPERATORS.includes(key)) {
                throw new Error(`Validation failed: mutation operator not allowed: ${key}`);
            }

            // Recursively check nested objects and arrays
            if (typeof value === 'object' && value !== null) {
                this.checkForMutationOperators(value, path ? `${path}.${key}` : key);
            }
        }
    }

    normalizeLimit() {
        // Use default if not provided
        if (this.limit === undefined || this.limit === null) {
            this.limit = QueryRequest.DEFAULT_LIMIT;
            return;
        }

        // Convert to number if string
        const numLimit = Number(this.limit);
        
        // If non-numeric (NaN), use default
        if (isNaN(numLimit)) {
            this.limit = QueryRequest.DEFAULT_LIMIT;
            return;
        }
        
        // Clamp to valid range
        if (numLimit < QueryRequest.MIN_LIMIT) {
            this.limit = QueryRequest.MIN_LIMIT;
        } else if (numLimit > QueryRequest.MAX_LIMIT) {
            this.limit = QueryRequest.MAX_LIMIT;
        } else {
            this.limit = numLimit;
        }
    }

    /**
     * Convert to CouchDB _find request body
     * Forces update: false to disable index refresh (treat as non-read-only)
     */
    toRequestBody() {
        const body = {
            selector: this.selector,
            limit: this.limit,
            update: false  // force index refresh disabled
        };

        // Only include optional fields if they are defined
        if (this.fields !== undefined) {
            body.fields = this.fields;
        }

        if (this.sort !== undefined) {
            body.sort = this.sort;
        }

        if (this.bookmark !== undefined) {
            body.bookmark = this.bookmark;
        }

        if (this.use_index !== undefined) {
            body.use_index = this.use_index;
        }

        if (this.execution_stats !== undefined) {
            body.execution_stats = this.execution_stats;
        }

        return body;
    }
}
