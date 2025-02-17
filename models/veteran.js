export class Veteran {
    constructor(data = {}) {
        this._id = data._id || '';
        this._rev = data._rev || '';
        this.type = data.type || '';
        this.name = {
            first: data.name?.first || '',
            middle: data.name?.middle || '',
            last: data.name?.last || '',
            nickname: data.name?.nickname || ''
        };
        this.birth_date = data.birth_date || '';
        this.gender = data.gender || '';
        this.address = {
            street: data.address?.street || '',
            city: data.address?.city || '',
            state: data.address?.state || '',
            zip: data.address?.zip || '',
            county: data.address?.county || '',
            phone_day: data.address?.phone_day || '',
            phone_eve: data.address?.phone_eve || '',
            phone_mbl: data.address?.phone_mbl || '',
            email: data.address?.email || ''
        };
        this.service = {
            branch: data.service?.branch || '',
            rank: data.service?.rank || '',
            dates: data.service?.dates || '',
            activity: data.service?.activity || ''
        };
        this.flight = {
            id: data.flight?.id || '',
            status: data.flight?.status || 'Active',
            group: data.flight?.group || '',
            bus: data.flight?.bus || '',
            seat: data.flight?.seat || '',
            confirmed_date: data.flight?.confirmed_date || '',
            confirmed_by: data.flight?.confirmed_by || '',
            status_note: data.flight?.status_note || '',
            history: data.flight?.history || []
        };
        this.medical = {
            form: data.medical?.form || false,
            release: data.medical?.release || false,
            level: data.medical?.level || '',
            limitations: data.medical?.limitations || '',
            food_restriction: data.medical?.food_restriction || 'None',
            usesCane: data.medical?.usesCane || false,
            usesWalker: data.medical?.usesWalker || false,
            usesWheelchair: data.medical?.usesWheelchair || 0,
            usesScooter: data.medical?.usesScooter || false,
            requiresOxygen: data.medical?.requiresOxygen || false
        };
        this.guardian = {
            id: data.guardian?.id || '',
            name: data.guardian?.name || '',
            pref_notes: data.guardian?.pref_notes || '',
            history: data.guardian?.history || []
        };
        this.app_date = data.app_date || '';
        this.vet_type = data.vet_type || '';
        this.shirt = {
            size: data.shirt?.size || ''
        };
        this.metadata = {
            created_at: data.metadata?.created_at || new Date().toISOString(),
            created_by: data.metadata?.created_by || '',
            updated_at: data.metadata?.updated_at || new Date().toISOString(),
            updated_by: data.metadata?.updated_by || ''
        };
    }

    // Enhanced validation with specific field rules
    validate() {
        const errors = [];

        // Required fields and pattern validations from template
        if (!this.name.first || !/^[a-zA-Z'. ]{2,}$/.test(this.name.first)) {
            errors.push('First name is required and must contain only letters, periods, apostrophes and spaces (min 2 chars)');
        }
        if (!this.name.last || !/^[a-zA-Z'. -]{2,}$/.test(this.name.last)) {
            errors.push('Last name is required and must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
        }
        if (this.name.middle && !/^[a-zA-Z' ]*$/.test(this.name.middle)) {
            errors.push('Middle name must contain only letters, apostrophes and spaces');
        }
        if (this.name.nickname && !/^[a-zA-Z'. ]*$/.test(this.name.nickname)) {
            errors.push('Nickname must contain only letters, periods, apostrophes and spaces');
        }

        // Address validations
        if (!this.address.street || !/^[a-zA-Z0-9.,# /-]{2,}$/.test(this.address.street)) {
            errors.push('Street address is required and must contain only letters, numbers, and basic punctuation (min 2 chars)');
        }
        if (!this.address.city || !/^[a-zA-Z. -]{2,}$/.test(this.address.city)) {
            errors.push('City is required and must contain only letters, periods, hyphens and spaces (min 2 chars)');
        }
        if (!this.address.county || !/^[a-zA-Z. ]{2,}$/.test(this.address.county)) {
            errors.push('County is required and must contain only letters, periods and spaces (min 2 chars)');
        }
        if (!this.address.state || !/^[a-zA-Z]{2}$/.test(this.address.state)) {
            errors.push('State is required and must be exactly 2 letters');
        }
        if (!this.address.zip || !/^[0-9 -]{5,}$/.test(this.address.zip)) {
            errors.push('ZIP code is required and must contain at least 5 digits');
        }
        if (!this.address.phone_day || !/^[0-9 -]{12,}$/.test(this.address.phone_day)) {
            errors.push('Day phone is required and must contain at least 12 digits/characters');
        }
        if (this.address.phone_eve && !/^[0-9 -]*$/.test(this.address.phone_eve)) {
            errors.push('Evening phone must contain only numbers, spaces and hyphens');
        }
        if (this.address.phone_mbl && !/^[0-9 -]*$/.test(this.address.phone_mbl)) {
            errors.push('Mobile phone must contain only numbers, spaces and hyphens');
        }
        if (this.address.email && !/^[^@]+@[^@]+\.[^@]+$/.test(this.address.email)) {
            errors.push('Email must be a valid email address');
        }

        // Service history validations
        if (this.service.rank && !/^[a-zA-Z0-9.,# /-]*$/.test(this.service.rank)) {
            errors.push('Rank must contain only letters, numbers, and basic punctuation');
        }

        // Type validation
        if (this.type !== 'Veteran') {
            errors.push('Document type must be Veteran');
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
            birth_date: this.birth_date,
            gender: this.gender,
            address: this.address,
            service: this.service,
            flight: this.flight,
            medical: this.medical,
            guardian: this.guardian,
            app_date: this.app_date,
            vet_type: this.vet_type,
            shirt: this.shirt,
            metadata: this.metadata
        };
    }

    static fromJSON(json) {
        return new Veteran(json);
    }
} 