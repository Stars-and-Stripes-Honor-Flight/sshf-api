export class Guardian {
    constructor(data = {}) {
        this._id = data._id || '';
        this._rev = data._rev || '';
        this.type = data.type || 'Guardian';
        this.name = {
            first: data.name?.first || '',
            middle: data.name?.middle || '',
            last: data.name?.last || '',
            nickname: data.name?.nickname || ''
        };
        this.birth_date = data.birth_date || '';
        this.gender = data.gender || 'M';
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
        this.flight = {
            id: data.flight?.id || 'None',
            status: data.flight?.status || 'Active',
            group: data.flight?.group || '',
            bus: data.flight?.bus || 'None',
            seat: data.flight?.seat || '',
            confirmed_date: data.flight?.confirmed_date || '',
            confirmed_by: data.flight?.confirmed_by || '',
            status_note: data.flight?.status_note || '',
            history: data.flight?.history || [],
            nofly: data.flight?.nofly || false,
            vaccinated: data.flight?.vaccinated || false,
            mediaWaiver: data.flight?.mediaWaiver || false,
            infection_test: data.flight?.infection_test || false,
            waiver: data.flight?.waiver || false,
            training: data.flight?.training || '',
            training_notes: data.flight?.training_notes || '',
            training_see_doc: data.flight?.training_see_doc || false,
            training_complete: data.flight?.training_complete || false,
            paid: data.flight?.paid || false,
            exempt: data.flight?.exempt || false,
            booksOrdered: data.flight?.booksOrdered || 0
        };
        this.medical = {
            form: data.medical?.form || false,
            release: data.medical?.release || false,
            level: data.medical?.level || '',
            limitations: data.medical?.limitations || '',
            food_restriction: data.medical?.food_restriction || 'None',
            experience: data.medical?.experience || '',
            can_push: data.medical?.can_push || false,
            can_lift: data.medical?.can_lift || false
        };
        this.veteran = {
            pref_notes: data.veteran?.pref_notes || '',
            history: data.veteran?.history || [],
            pairings: data.veteran?.pairings || []
        };
        this.app_date = data.app_date || '';
        this.shirt = {
            size: data.shirt?.size || 'None'
        };
        this.metadata = {
            created_at: data.metadata?.created_at || '',
            created_by: data.metadata?.created_by || '',
            updated_at: data.metadata?.updated_at || '',
            updated_by: data.metadata?.updated_by || ''
        };
        this.weight = data.weight || '';
        
        this.emerg_contact = {
            name: data.emerg_contact?.name || '',
            relation: data.emerg_contact?.relation || '',
            address: {
                phone: data.emerg_contact?.address?.phone || '',
                email: data.emerg_contact?.address?.email || ''
            }
        };

        this.notes = {
            other: data.notes?.other || '',
            service: data.notes?.service || 'N'
        };

        this.occupation = data.occupation || '';

        this.accommodations = {
            departure_time: data.accommodations?.departure_time || '',
            arrival_date: data.accommodations?.arrival_date || '',
            notes: data.accommodations?.notes || '',
            departure_date: data.accommodations?.departure_date || '',
            arrival_flight: data.accommodations?.arrival_flight || '',
            attend_banquette: data.accommodations?.attend_banquette || '',
            departure_flight: data.accommodations?.departure_flight || '',
            arrival_time: data.accommodations?.arrival_time || '',
            banquette_guest: data.accommodations?.banquette_guest || '',
            room_type: data.accommodations?.room_type || 'None',
            hotel_name: data.accommodations?.hotel_name || ''
        };

        this.mail_call = {
            received: data.mail_call?.received || '',
            name: data.mail_call?.name || '',
            notes: data.mail_call?.notes || '',
            relation: data.mail_call?.relation || '',
            address: {
                phone: data.mail_call?.address?.phone || '',
                email: data.mail_call?.address?.email || ''
            }
        };

        this.call = {
            fm_number: data.call?.fm_number || '',
            notes: data.call?.notes || '',
            email_sent: data.call?.email_sent || false,
            assigned_to: data.call?.assigned_to || '',
            mail_sent: data.call?.mail_sent || false,
            history: data.call?.history || []
        };

        this.apparel = {
            jacket_size: data.apparel?.jacket_size || 'None',
            notes: data.apparel?.notes || '',
            delivery: data.apparel?.delivery || 'None',
            item: data.apparel?.item || 'None',
            shirt_size: data.apparel?.shirt_size || 'None',
            date: data.apparel?.date || '',
            by: data.apparel?.by || ''
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

        // Type validation
        if (this.type !== 'Guardian') {
            errors.push('Document type must be Guardian');
        }

        // Weight validation (numeric string)
        if (this.weight && (!/^\d{1,3}$/.test(this.weight) || this.weight < 60 || this.weight > 450)) {
            errors.push('Weight must be a number between 60-450');
        }

        // Emergency Contact validations
        if (this.emerg_contact.name && !/^[a-zA-Z'. -]{2,}$/.test(this.emerg_contact.name)) {
            errors.push('Emergency contact name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
        }
        if (this.emerg_contact.address.phone && !/^[0-9 -]{12,}$/.test(this.emerg_contact.address.phone)) {
            errors.push('Emergency contact phone must contain at least 12 digits/characters');
        }
        if (this.emerg_contact.address.email && !/^[^@]+@[^@]+\.[^@]+$/.test(this.emerg_contact.address.email)) {
            errors.push('Emergency contact email must be a valid email address');
        }

        // Mail Call validations
        if (this.mail_call.name && !/^[a-zA-Z'. -]{2,}$/.test(this.mail_call.name)) {
            errors.push('Mail call name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
        }
        if (this.mail_call.address.phone && !/^[0-9 -]{12,}$/.test(this.mail_call.address.phone)) {
            errors.push('Mail call phone must contain at least 12 digits/characters');
        }
        if (this.mail_call.address.email && !/^[^@]+@[^@]+\.[^@]+$/.test(this.mail_call.address.email)) {
            errors.push('Mail call email must be a valid email address');
        }

        // Apparel validations
        if (this.apparel.jacket_size && !['None', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(this.apparel.jacket_size)) {
            errors.push('Invalid jacket size');
        }
        if (this.apparel.shirt_size && !['None', 'WXS', 'WS', 'WM', 'WL', 'WXL', 'W2XL', 'W3XL', 'W4XL', 'W5XL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(this.apparel.shirt_size)) {
            errors.push('Invalid shirt size');
        }
        if (this.apparel.delivery && !['None', 'Mailed', 'Training', 'Home'].includes(this.apparel.delivery)) {
            errors.push('Invalid delivery method');
        }
        if (this.apparel.item && !['None', 'Jacket', 'Polo', 'Both'].includes(this.apparel.item)) {
            errors.push('Invalid apparel item');
        }

        // Medical validations
        if (this.medical.level && !/^[A-D]$/.test(this.medical.level)) {
            errors.push('Medical level must be A, B, C, or D');
        }
        if (this.medical.food_restriction && !['None', 'Gluten Free', 'Vegetarian', 'Vegan'].includes(this.medical.food_restriction)) {
            errors.push('Invalid food restriction');
        }

        // Call history entries validation
        if (this.call.history && Array.isArray(this.call.history)) {
            this.call.history.forEach((entry, index) => {
                if (!entry.id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(entry.id)) {
                    errors.push(`Call history entry ${index + 1} has invalid timestamp format`);
                }
                if (!entry.change || typeof entry.change !== 'string') {
                    errors.push(`Call history entry ${index + 1} must have a change description`);
                }
            });
        }

        // Flight history entries validation
        if (this.flight.history && Array.isArray(this.flight.history)) {
            this.flight.history.forEach((entry, index) => {
                if (!entry.id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(entry.id)) {
                    errors.push(`Flight history entry ${index + 1} has invalid timestamp format`);
                }
                if (!entry.change || typeof entry.change !== 'string') {
                    errors.push(`Flight history entry ${index + 1} must have a change description`);
                }
            });
        }

        // Gender validation
        if (this.gender && !['M', 'F'].includes(this.gender)) {
            errors.push('Gender must be M or F');
        }

        // Notes service validation
        if (this.notes.service && !['Y', 'N'].includes(this.notes.service)) {
            errors.push('Service notes must be Y or N');
        }

        // Medical food restriction validation
        if (this.medical.food_restriction && !['None', 'Gluten Free', 'Vegetarian', 'Vegan'].includes(this.medical.food_restriction)) {
            errors.push('Invalid food restriction');
        }

        // Flight status validation
        if (this.flight.status && !['Active', 'Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction', 'Copied'].includes(this.flight.status)) {
            errors.push('Invalid flight status');
        }

        // Flight bus validation
        if (this.flight.bus && !['None', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5', 'Bravo1', 'Bravo2', 'Bravo3', 'Bravo4', 'Bravo5'].includes(this.flight.bus)) {
            errors.push('Invalid bus assignment');
        }

        // Flight training validation
        if (this.flight.training && !['None', 'Main', 'Previous', 'Phone', 'Web', 'Make-up'].includes(this.flight.training)) {
            errors.push('Invalid training type');
        }

        // Birth date validation
        if (this.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(this.birth_date)) {
            errors.push('Birth date must be in YYYY-MM-DD format');
        }

        // Shirt size validation
        if (this.shirt.size && !['None', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(this.shirt.size)) {
            errors.push('Invalid shirt size');
        }

        // Accommodations room type validation
        if (this.accommodations?.room_type && !['None', 'Double', 'Single'].includes(this.accommodations.room_type)) {
            errors.push('Invalid room type');
        }

        // Veteran pairings validation
        if (this.veteran.pairings && Array.isArray(this.veteran.pairings)) {
            this.veteran.pairings.forEach((pairing, index) => {
                if (!pairing.id || typeof pairing.id !== 'string') {
                    errors.push(`Veteran pairing ${index + 1} must have a valid id`);
                }
                if (!pairing.name || typeof pairing.name !== 'string') {
                    errors.push(`Veteran pairing ${index + 1} must have a valid name`);
                }
            });
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

    /**
     * Updates history arrays when tracked properties change.
     * 
     * GUARDIAN HISTORY TRACKING DOCUMENTATION:
     * ========================================
     * 
     * flight.history tracks changes to:
     * ---------------------------------
     * | Property               | Display Name             |
     * |------------------------|--------------------------|
     * | flight.id              | flight                   |
     * | flight.bus             | bus                      |
     * | flight.status          | status                   |
     * | flight.seat            | seat                     |
     * | flight.confirmed_date  | confirmed date           |
     * | flight.training        | training                 |
     * | flight.paid            | paid                     |
     * | flight.training_see_doc| training see doctor      |
     * | flight.training_complete| training complete       |
     * | flight.waiver          | flight waiver received   |
     * | flight.mediaWaiver     | media waiver received    |
     * | flight.vaccinated      | vaccinated               |
     * | flight.infection_test  | infection test           |
     * | flight.nofly           | flight nofly             |
     * | flight.exempt          | exempt                   |
     * | flight.booksOrdered    | books ordered            |
     * | medical.release        | medical release received |
     * | medical.form           | medical form received    |
     * 
     * call.history tracks changes to:
     * -------------------------------
     * | Property               | Display Name             |
     * |------------------------|--------------------------|
     * | call.assigned_to       | assigned caller          |
     * | call.fm_number         | FM #                     |
     * | call.email_sent        | guardian email sent      |
     * 
     * veteran.history tracks pairing changes (handled in routes/guardians.js):
     * ------------------------------------------------------------------------
     * | Event                  | Format                                        |
     * |------------------------|-----------------------------------------------|
     * | Veteran paired         | "paired to: {veteranName} by: {userName}"     |
     * | Veteran unpaired       | "unpaired from: {veteranName} by: {userName}" |
     * 
     * @param {Guardian} currentGuardian - The current guardian document from the database
     * @param {Object} user - The user making the change (with firstName and lastName)
     */
    updateHistory(currentGuardian, user) {
        const userName = user.firstName + ' ' + user.lastName;
        // Format timestamp as yyyy-MM-DDThh:mm:ssZ without milliseconds
        const now = new Date();
        const timestamp = now.toISOString().split('.')[0] + 'Z';

        const historyMapping = [
            {
                'historyProperty': 'flight.history',
                'trackedProperties': [
                    { 'property': 'flight.id', 'name': 'flight' },
                    { 'property': 'flight.bus', 'name': 'bus' },
                    { 'property': 'flight.status', 'name': 'status' },
                    { 'property': 'flight.seat', 'name': 'seat' },
                    { 'property': 'flight.confirmed_date', 'name': 'confirmed date' },
                    { 'property': 'flight.training', 'name': 'training' },
                    { 'property': 'flight.paid', 'name': 'paid' },
                    { 'property': 'flight.training_see_doc', 'name': 'training see doctor' },
                    { 'property': 'flight.training_complete', 'name': 'training complete' },
                    { 'property': 'flight.waiver', 'name': 'flight waiver received' },
                    { 'property': 'flight.mediaWaiver', 'name': 'media waiver received' },
                    { 'property': 'flight.vaccinated', 'name': 'vaccinated' },
                    { 'property': 'flight.infection_test', 'name': 'infection test' },
                    { 'property': 'flight.nofly', 'name': 'flight nofly' },
                    { 'property': 'flight.exempt', 'name': 'exempt' },
                    { 'property': 'flight.booksOrdered', 'name': 'books ordered' },
                    { 'property': 'medical.release', 'name': 'medical release received' },
                    { 'property': 'medical.form', 'name': 'medical form received' }
                ]
            },
            {
                'historyProperty': 'call.history',
                'trackedProperties': [
                    { 'property': 'call.assigned_to', 'name': 'assigned caller' },
                    { 'property': 'call.fm_number', 'name': 'FM #' },
                    { 'property': 'call.email_sent', 'name': 'guardian email sent' }
                ]
            }
        ];

        historyMapping.forEach(mapping => {
            mapping.trackedProperties.forEach(trackedProperty => {
                this.checkForChanges(currentGuardian, mapping.historyProperty, trackedProperty, userName, timestamp);
            });
        });
    }
    
    getValue(obj, path) {
        const keys = path.split('.');
        let result = obj;
      
        for (const key of keys) {
          if (result && typeof result === 'object' && key in result) {
            result = result[key];
          } else {
            return undefined;
          }
        }
        return result;
    }

    checkForChanges(currentGuardian, historyProperty, trackedProperty, userName, timestamp) {
        const currentValue = this.getValue(currentGuardian, trackedProperty.property);
        const newValue = this.getValue(this, trackedProperty.property);
        if (currentValue !== newValue) {
            this.getValue(this, historyProperty).push({
                id: timestamp,
                change: `changed ${trackedProperty.name} from: ${currentValue} to: ${newValue} by: ${userName}`
            });
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
            flight: this.flight,
            medical: this.medical,
            veteran: this.veteran,
            app_date: this.app_date,
            shirt: this.shirt,
            metadata: this.metadata,
            weight: this.weight,
            emerg_contact: this.emerg_contact,
            notes: this.notes,
            occupation: this.occupation,
            accommodations: this.accommodations,
            mail_call: this.mail_call,
            call: this.call,
            apparel: this.apparel
        };
    }

    static fromJSON(json) {
        return new Guardian(json);
    }
} 