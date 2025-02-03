export class SearchRequest {
    constructor(data = {}) {
        this.limit = data.limit || 10;  // Default limit of 10 if not specified
        this.startkey = data.startkey || '';
        this.endkey = data.endkey || '';
    }

    // Getter methods
    getLimit() { return this.limit; }
    getStartKey() { return this.startkey; }
    getEndKey() { return this.endkey; }

    // Convert to query parameters for CouchDB
    toQueryParams() {
        const params = new URLSearchParams();
        
        if (this.limit) params.append('limit', this.limit);
        if (this.startkey) params.append('startkey', `${this.startkey}`);
        if (this.endkey) params.append('endkey', `${this.endkey}`);
        
        return params.toString();
    }

    // Convert to JSON object
    toJSON() {
        return {
            limit: this.limit,
            startkey: this.startkey,
            endkey: this.endkey
        };
    }
} 