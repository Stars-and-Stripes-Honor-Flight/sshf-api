export class Flight {
    constructor(data = {}) {
        this._id = data._id || '';
        this._rev = data._rev || '';
        this.type = data.type || 'Flight';
        this.name = data.name || '';
        this.flight_date = data.flight_date || '';
        this.capacity = data.capacity !== undefined ? data.capacity : 0;
        this.completed = data.completed !== undefined ? data.completed : false;
        this.metadata = {
            created_at: data.metadata?.created_at || '',
            created_by: data.metadata?.created_by || '',
            updated_at: data.metadata?.updated_at || '',
            updated_by: data.metadata?.updated_by || ''
        };
    }

    validate() {
        const errors = [];

        // Type validation
        if (this.type !== 'Flight') {
            errors.push('Document type must be Flight');
        }

        // Name validation - required and non-empty
        if (!this.name || typeof this.name !== 'string' || this.name.trim().length === 0) {
            errors.push('Name is required and must be a non-empty string');
        }

        // Flight date validation - required and format YYYY-MM-DD
        if (!this.flight_date) {
            errors.push('Flight date is required');
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(this.flight_date)) {
            errors.push('Flight date must be in YYYY-MM-DD format');
        }

        // Capacity validation - required and positive integer
        if (this.capacity === undefined || this.capacity === null) {
            errors.push('Capacity is required');
        } else if (!Number.isInteger(this.capacity) || this.capacity <= 0) {
            errors.push('Capacity must be a positive integer');
        }

        // Completed validation - must be boolean
        if (typeof this.completed !== 'boolean') {
            errors.push('Completed must be a boolean value');
        }

        if (errors.length > 0) {
            throw new Error('Validation failed: ' + errors.join('; '));
        }
        
        return true;
    }

    // Update metadata before save
    prepareForSave(user) {
        const userName = user.firstName + ' ' + user.lastName;
        // Format timestamp as yyyy-MM-DDThh:mm:ssZ without milliseconds
        const now = new Date();
        const timestamp = now.toISOString().split('.')[0] + 'Z';
        
        this.metadata.updated_at = timestamp;
        this.metadata.updated_by = userName;
        if (!this.metadata.created_at) {
            this.metadata.created_at = timestamp;
            this.metadata.created_by = userName;
        }
    }

    toJSON() {
        return {
            _id: this._id,
            _rev: this._rev,
            type: this.type,
            name: this.name,
            flight_date: this.flight_date,
            capacity: this.capacity,
            completed: this.completed,
            metadata: this.metadata
        };
    }

    static fromJSON(json) {
        return new Flight(json);
    }
}

