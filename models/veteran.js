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
            history: data.flight?.history || [],
            nofly: data.flight?.nofly || false,
            vaccinated: data.flight?.vaccinated || false,
            mediaWaiver: data.flight?.mediaWaiver || false,
            infection_test: data.flight?.infection_test || false,
            waiver: data.flight?.waiver || false
        };
        this.medical = {
            form: data.medical?.form || false,
            release: data.medical?.release || false,
            level: data.medical?.level || '',
            limitations: data.medical?.limitations || '',
            food_restriction: data.medical?.food_restriction || 'None',
            usesCane: data.medical?.usesCane || false,
            usesWalker: data.medical?.usesWalker || false,
            usesWheelchair: data.medical?.usesWheelchair || false,
            usesScooter: data.medical?.usesScooter || false,
            requiresOxygen: data.medical?.requiresOxygen || false,
            examRequired: data.medical?.examRequired || false,
            review: data.medical?.review || '',
            isWheelchairBound: data.medical?.isWheelchairBound || false,
            alt_level: data.medical?.alt_level || ''
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
        this.weight = data.weight || '';
        
        this.alt_contact = {
            name: data.alt_contact?.name || '',
            relation: data.alt_contact?.relation || '',
            address: {
                street: data.alt_contact?.address?.street || '',
                city: data.alt_contact?.address?.city || '',
                state: data.alt_contact?.address?.state || '',
                zip: data.alt_contact?.address?.zip || '',
                phone: data.alt_contact?.address?.phone || '',
                phone_mbl: data.alt_contact?.address?.phone_mbl || '',
                phone_eve: data.alt_contact?.address?.phone_eve || '',
                email: data.alt_contact?.address?.email || ''
            }
        };

        this.emerg_contact = {
            name: data.emerg_contact?.name || '',
            relation: data.emerg_contact?.relation || '',
            address: {
                street: data.emerg_contact?.address?.street || '',
                city: data.emerg_contact?.address?.city || '',
                state: data.emerg_contact?.address?.state || '',
                zip: data.emerg_contact?.address?.zip || '',
                phone: data.emerg_contact?.address?.phone || '',
                phone_mbl: data.emerg_contact?.address?.phone_mbl || '',
                phone_eve: data.emerg_contact?.address?.phone_eve || '',
                email: data.emerg_contact?.address?.email || ''
            }
        };

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
            received: data.mail_call?.received || false,
            name: data.mail_call?.name || '',
            notes: data.mail_call?.notes || '',
            adopt: data.mail_call?.adopt || '',
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

        this.media_interview_ok = data.media_interview_ok || 'No';
        this.media_newspaper_ok = data.media_newspaper_ok || 'No';

        this.homecoming = {
            destination: data.homecoming?.destination || ''
        };

        this.apparel = {
            jacket_size: data.apparel?.jacket_size || '',
            notes: data.apparel?.notes || '',
            delivery: data.apparel?.delivery || '',
            item: data.apparel?.item || 'None',
            shirt_size: data.apparel?.shirt_size || '',
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

        // Service history validations
        if (this.service.rank && !/^[a-zA-Z0-9.,# /-]*$/.test(this.service.rank)) {
            errors.push('Rank must contain only letters, numbers, and basic punctuation');
        }

        // Type validation
        if (this.type !== 'Veteran') {
            errors.push('Document type must be Veteran');
        }

        // Weight validation (numeric string)
        if (this.weight && !/^\d{1,3}$/.test(this.weight)) {
            errors.push('Weight must be a number between 1-999');
        }

        // Emergency Contact validations
        if (this.emerg_contact.name && !/^[a-zA-Z'. -]{2,}$/.test(this.emerg_contact.name)) {
            errors.push('Emergency contact name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
        }
        if (this.emerg_contact.phone && !/^[0-9 -]{12,}$/.test(this.emerg_contact.phone)) {
            errors.push('Emergency contact phone must contain at least 12 digits/characters');
        }

        // Alternate Contact validations
        if (this.alt_contact.name && !/^[a-zA-Z'. -]{2,}$/.test(this.alt_contact.name)) {
            errors.push('Alternate contact name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
        }
        if (this.alt_contact.phone && !/^[0-9 -]{12,}$/.test(this.alt_contact.phone)) {
            errors.push('Alternate contact phone must contain at least 12 digits/characters');
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

        // Media permissions validation
        if (this.media_interview_ok && !['Yes', 'No', 'Unknown'].includes(this.media_interview_ok)) {
            errors.push('Media interview permission must be Yes, No, or Unknown');
        }
        if (this.media_newspaper_ok && !['Yes', 'No', 'Unknown'].includes(this.media_newspaper_ok)) {
            errors.push('Media newspaper permission must be Yes, No, or Unknown');
        }

        // Apparel validations
        if (this.apparel.jacket_size && !['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(this.apparel.jacket_size)) {
            errors.push('Invalid jacket size');
        }
        if (this.apparel.shirt_size && !['WXS', 'WS', 'WM', 'WL', 'WXL', 'W2XL', 'W3XL', 'W4XL', 'W5XL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(this.apparel.shirt_size)) {
            errors.push('Invalid shirt size');
        }
        if (this.apparel.delivery && !['None', 'Mailed', 'Pickup', 'Delivered'].includes(this.apparel.delivery)) {
            errors.push('Invalid delivery method');
        }

        // Medical validations (additional)
        if (this.medical.level && !['1', '2', '3', '3.5', '4'].includes(this.medical.level)) {
            errors.push('Medical level must be 1, 2, 3, 3.5, or 4');
        }
        if (this.medical.alt_level && !['1', '2', '3', '3.5', '4'].includes(this.medical.alt_level)) {
            errors.push('Medical level must be 1, 2, 3, 3.5, or 4');
        }

        // Validate call history entries if present
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

        // Gender validation
        if (this.gender && !['M', 'F'].includes(this.gender)) {
            errors.push('Gender must be M or F');
        }

        // Service branch validation
        if (this.service.branch && !['Unknown', 'Army', 'Air Force', 'Navy', 'Marines', 'Coast Guard'].includes(this.service.branch)) {
            errors.push('Invalid service branch');
        }

        // Veteran type validation
        if (this.vet_type && !['WWII', 'Korea', 'Vietnam', 'Afghanistan', 'Iraq', 'Other'].includes(this.vet_type)) {
            errors.push('Invalid veteran type');
        }

        // Medical food restriction validation
        if (this.medical.food_restriction && !['None', 'Gluten Free', 'Vegetarian', 'Vegan'].includes(this.medical.food_restriction)) {
            errors.push('Invalid food restriction');
        }

        // Flight status validation
        if (this.flight.status && !['Active', 'Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction'].includes(this.flight.status)) {
            errors.push('Invalid flight status');
        }

        // Flight bus validation
        if (this.flight.bus && !['None', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5', 'Bravo1', 'Bravo2', 'Bravo3', 'Bravo4', 'Bravo5'].includes(this.flight.bus)) {
            errors.push('Invalid bus assignment');
        }

        // Apparel item validation
        if (this.apparel.item && !['None', 'Jacket', 'Polo', 'Both'].includes(this.apparel.item)) {
            errors.push('Invalid apparel item');
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

    updateHistory(currentVeteran, user) {
        const userName = user.firstName + ' ' + user.lastName;
        // Format timestamp as yyyy-MM-DDThh:mm:ssZ without milliseconds
        const now = new Date();
        const timestamp = now.toISOString().split('.')[0] + 'Z';

        const historyMapping = [
            {
                'historyProperty':'flight.history',
                'trackedProperties': [
                { 'property': 'flight.id', 'name': 'flight' },
                { 'property': 'flight.bus', 'name': 'bus' },
                { 'property': 'flight.status', 'name': 'status' },
                { 'property': 'flight.seat', 'name': 'seat' },
                { 'property': 'flight.confirmed_date', 'name': 'confirmed date' }
            ]},
            {
                'historyProperty': 'call.history',
                'trackedProperties': [
                { 'property': 'mail_call.received', 'name': 'mail_call received' },
                { 'property': 'call.assigned_to', 'name': 'assigned caller' } 
            ]}
        ];

        historyMapping.forEach(mapping => {
            mapping.trackedProperties.forEach(trackedProperty => {
                this.checkForChanges(currentVeteran, mapping.historyProperty, trackedProperty, userName, timestamp);
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

    checkForChanges(currentVeteran, historyProperty, trackedProperty, userName, timestamp) {
        const currentValue = this.getValue(currentVeteran, trackedProperty.property);
        const newValue = this.getValue(this, trackedProperty.property);
        if (currentValue !== newValue) {
            this.getValue(this, historyProperty).push({
                id: timestamp,
                change: `changed ${trackedProperty.name} from ${currentValue} to ${newValue} by: ${userName}`
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
            service: this.service,
            flight: this.flight,
            medical: this.medical,
            guardian: this.guardian,
            app_date: this.app_date,
            vet_type: this.vet_type,
            shirt: this.shirt,
            metadata: this.metadata,
            weight: this.weight,
            alt_contact: this.alt_contact,
            emerg_contact: this.emerg_contact,
            accommodations: this.accommodations,
            mail_call: this.mail_call,
            call: this.call,
            media_interview_ok: this.media_interview_ok,
            media_newspaper_ok: this.media_newspaper_ok,
            homecoming: this.homecoming,
            apparel: this.apparel
        };
    }

    static fromJSON(json) {
        return new Veteran(json);
    }
}