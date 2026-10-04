export class UnpairedVeteranRequest {
    constructor(data = {}) {
        // Set defaults
        this.paired = data.paired === true || data.paired === 'true';
        this.status = data.status || 'Active';
        this.lastname = data.lastname || '';
        // basic/unpaired_veterans_by_last_name emits
        // [doc.flight.status, doc.name.last.toUpperCase()].
        // Spaces, apostrophes, and periods stay in the key.
        // /search name views emit name.last.replace(/['\. ]/g, '') with case unchanged.
        // That helper is a different contract and would miss stored names such as "Le Roy".
        this.lastnameKey = String(this.lastname).toUpperCase();
        this.limit = data.limit !== undefined && data.limit !== null ? data.limit : 25;
    }

    getViewName() {
        if (this.paired) {
            return null; // Will be handled in route as "Not Implemented"
        }
        return 'unpaired_veterans_by_last_name';
    }

    // Convert to query parameters for CouchDB
    toQueryParams() {
        const params = new URLSearchParams();
        
        if (this.limit) {
            params.append('limit', this.limit);
        }

        // View key format: [status, lastname.toUpperCase()], spaces and punctuation kept.
        const startKey = JSON.stringify([this.status, this.lastnameKey]);
        const endKey = JSON.stringify([this.status, this.lastnameKey + '\ufff0']);
        params.append('startkey', startKey);
        params.append('endkey', endKey);
        
        return params.toString();
    }

    // Convert to JSON object
    toJSON() {
        return {
            paired: this.paired,
            status: this.status,
            lastname: this.lastname,
            limit: this.limit,
            viewName: this.getViewName()
        };
    }
}

