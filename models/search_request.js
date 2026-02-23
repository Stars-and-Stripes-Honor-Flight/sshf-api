export class SearchRequest {
    constructor(data = {}) {
        // Set defaults
        this.limit = data.limit || 25;
        this.lastname = data.lastname || '';
        this.status = data.status || 'Active';
        this.flight = data.flight || 'All';
        this.phone_num = data.phone_num || '';
        this.digitsOnlyPhone = String(this.phone_num).replace(/[^0-9]/g, '');

        // Validate and enforce rules
        this.validateAndNormalize();
    }

    validateAndNormalize() {
        // For non-phone searches, if Status is not 'All' then Flight must be 'All'
        if (!this.digitsOnlyPhone && this.status !== 'All' && this.flight !== 'All') {
            this.flight = 'All';
        }

        // For phone searches, require at least 3 numeric digits.
        if (this.phone_num && this.digitsOnlyPhone.length < 3) {
            throw new Error('Validation failed: phone_num must contain at least 3 numeric digits');
        }
    }

    getViewName() {
        if (this.digitsOnlyPhone) {
            return 'all_by_phone_number';
        }
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
        if (viewName === 'all_by_phone_number') {
            const startKey = JSON.stringify([this.digitsOnlyPhone]);
            const endKey = JSON.stringify([this.digitsOnlyPhone + '\ufff0']);
            params.append('startkey', startKey);
            params.append('endkey', endKey);
        }
        else if (viewName === 'all_by_status_and_name') {
            const startKey = JSON.stringify([this.status, this.lastname]);
            const endKey = JSON.stringify([this.status, '\ufff0']);
            params.append('startkey', startKey);
            params.append('endkey', endKey);
        } 
        else if (viewName === 'all_by_flight_and_name') {
            const startKey = JSON.stringify([this.flight, this.lastname]);
            const endKey = JSON.stringify([this.flight, '\ufff0']);
            params.append('startkey', startKey);
            params.append('endkey', endKey);
        }
        else {  // all_by_name view
            const startKey = JSON.stringify([this.lastname]);
            const endKey = JSON.stringify(['\ufff0']);
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
            phone_num: this.phone_num,
            viewName: this.getViewName()
        };
    }
} 