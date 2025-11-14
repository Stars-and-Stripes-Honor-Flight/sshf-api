export class UnpairedVeteranRequest {
    constructor(data = {}) {
        // Set defaults
        this.paired = data.paired === true || data.paired === 'true';
        this.status = data.status || 'Active';
        this.lastname = data.lastname || '';
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

        // View key format: [status, lastname.toUpperCase()]
        const lastnameUpper = this.lastname.toUpperCase();
        const startKey = JSON.stringify([this.status, lastnameUpper]);
        const endKey = JSON.stringify([this.status, lastnameUpper + '\ufff0']);
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

