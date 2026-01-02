export class WaitlistRequest {
    constructor(data = {}) {
        // Type is required - 'veterans' or 'guardians'
        this.type = data.type || '';
        
        // Pagination parameters with defaults
        this.offset = data.offset !== undefined && data.offset !== null 
            ? parseInt(data.offset, 10) 
            : 0;
        this.limit = data.limit !== undefined && data.limit !== null 
            ? parseInt(data.limit, 10) 
            : 20;
        
        // Ensure non-negative values
        if (this.offset < 0) this.offset = 0;
        if (this.limit < 1) this.limit = 20;
    }

    /**
     * Validates the request parameters
     * @returns {{valid: boolean, error?: string}}
     */
    validate() {
        if (!this.type) {
            return { valid: false, error: 'type parameter is required' };
        }
        if (this.type !== 'veterans' && this.type !== 'guardians') {
            return { valid: false, error: 'type must be either "veterans" or "guardians"' };
        }
        return { valid: true };
    }

    /**
     * Returns the CouchDB view name based on type
     * @returns {string|null}
     */
    getViewName() {
        if (this.type === 'veterans') {
            return 'waitlist_veterans';
        }
        if (this.type === 'guardians') {
            return 'waitlist_guardians';
        }
        return null;
    }

    /**
     * Convert to query parameters for CouchDB
     * @returns {string}
     */
    toQueryParams() {
        const params = new URLSearchParams();
        
        // Use skip for offset-based pagination
        if (this.offset > 0) {
            params.append('skip', this.offset);
        }
        
        params.append('limit', this.limit);
        params.append('include_docs', 'true');
        
        return params.toString();
    }

    /**
     * Convert to JSON object
     * @returns {Object}
     */
    toJSON() {
        return {
            type: this.type,
            offset: this.offset,
            limit: this.limit,
            viewName: this.getViewName()
        };
    }
}

