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

    // Validate required fields
    validate() {
        if (!this.name.last || !this.name.first) {
            throw new Error('First and last name are required');
        }

        // Require type to be exactly 'Veteran'
        if (this.type !== 'Veteran') {
            throw new Error('Document type must be Veteran, got: ' + this.type);
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