export class SearchRequest {
    constructor(data = {}) {
        // Set defaults
        this.limit = data.limit || 25;
        this.lastname = data.lastname || '';
        this.status = data.status || 'Active';
        this.flight = data.flight || 'All';

        // Validate and enforce rules
        this.validateAndNormalize();
    }

    validateAndNormalize() {
        // If Status is not 'All' then Flight must be 'All'
        if (this.status !== 'All' && this.flight !== 'All') {
            this.flight = 'All';
        }
    }

    getViewName() {
        if (this.status !== 'All') {
            return 'all_by_status_and_name';
        }
        if (this.flight !== 'All') {
            return 'all_by_flight_and_name';
        }
        return 'all_by_name';
    }

    // Convert to query parameters for CouchDB
    toQueryParams() {
        const params = new URLSearchParams();
        const viewName = this.getViewName();
        
        if (this.limit) {
            params.append('limit', this.limit);
        }

        // Set startkey and endkey based on view type
        if (viewName === 'all_by_status_and_name') {
            const startKey = JSON.stringify([this.status, this.lastname]);
            const endKey = JSON.stringify([this.status, this.lastname + '\ufff0']);
            params.append('startkey', startKey);
            params.append('endkey', endKey);
        } 
        else if (viewName === 'all_by_flight_and_name') {
            const startKey = JSON.stringify([this.flight, this.lastname]);
            const endKey = JSON.stringify([this.flight, this.lastname + '\ufff0']);
            params.append('startkey', startKey);
            params.append('endkey', endKey);
        }
        else {  // all_by_name view
            const startKey = JSON.stringify(this.lastname);
            const endKey = JSON.stringify(this.lastname + '\ufff0');
            params.append('startkey', startKey);
            params.append('endkey', endKey);
        }
        
        return params.toString();
    }

    // Convert to JSON object
    toJSON() {
        return {
            limit: this.limit,
            lastname: this.lastname,
            status: this.status,
            flight: this.flight,
            viewName: this.getViewName()
        };
    }
} 