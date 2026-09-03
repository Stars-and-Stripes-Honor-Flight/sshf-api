/**
 * MangoFindRequest model
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
    'type',        // index type for creation
    'map',         // map/reduce
    'reduce',      // map/reduce
    'views'        // design doc views
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

export class MangoFindRequest {
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

        // Validate
        this.validate(data);
        
        // Normalize limit
        this.normalizeLimit();
    }

    validate(data) {
        // Check for unknown keys
        const unknownKeys = Object.keys(data).filter(key => !ALLOWED_KEYS.includes(key));
        if (unknownKeys.length > 0) {
            throw new Error(`Validation failed: unknown keys not allowed: ${unknownKeys.join(', ')}`);
        }

        // Check for denied keys
        const deniedKeys = Object.keys(data).filter(key => DENIED_KEYS.includes(key));
        if (deniedKeys.length > 0) {
            throw new Error(`Validation failed: forbidden keys detected: ${deniedKeys.join(', ')}`);
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
    }

    checkForMutationOperators(obj, path = '') {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }

        for (const [key, value] of Object.entries(obj)) {
            // Check if this key is a denied operator
            if (DENIED_OPERATORS.includes(key)) {
                const location = path ? `${path}.${key}` : key;
                throw new Error(`Validation failed: mutation operator not allowed: ${key}`);
            }

            // Recursively check nested objects and arrays
            if (typeof value === 'object' && value !== null) {
                const newPath = path ? `${path}.${key}` : key;
                this.checkForMutationOperators(value, newPath);
            }
        }
    }

    normalizeLimit() {
        // Use default if not provided
        if (this.limit === undefined || this.limit === null) {
            this.limit = MangoFindRequest.DEFAULT_LIMIT;
            return;
        }

        // Convert to number if string
        const numLimit = Number(this.limit);
        
        // Clamp to valid range
        if (numLimit < MangoFindRequest.MIN_LIMIT) {
            this.limit = MangoFindRequest.MIN_LIMIT;
        } else if (numLimit > MangoFindRequest.MAX_LIMIT) {
            this.limit = MangoFindRequest.MAX_LIMIT;
        } else {
            this.limit = numLimit;
        }
    }

    /**
     * Convert to CouchDB _find request body
     */
    toRequestBody() {
        const body = {
            selector: this.selector,
            limit: this.limit
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
