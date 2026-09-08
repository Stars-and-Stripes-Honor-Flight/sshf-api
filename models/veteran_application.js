import { ReviewApplication, cloneDocument, fixPhone } from './review_application.js';
import { Veteran } from './veteran.js';

const VET_TYPES = ['WWII', 'Korea', 'Vietnam', 'Afghanistan', 'Iraq', 'Other'];
const SERVICE_BRANCHES = ['', 'Unknown', 'Army', 'Air Force', 'Navy', 'Marines', 'Coast Guard'];

function yesNo(value) {
    return value ? 'Yes' : 'No';
}

function isYes(value) {
    return typeof value === 'string' && value.trim().toLowerCase() === 'yes';
}

/**
 * Veteran application awaiting review (legacy type `VeteranApp`).
 */
export class VeteranApplication extends ReviewApplication {
    constructor(data = {}) {
        super({ ...data, type: data.type || 'VeteranApp' });
        this.vet_type = data.vet_type || 'WWII';
        this.service = {
            branch: data.service?.branch || '',
            dates: data.service?.dates || '',
            rank: data.service?.rank || ''
        };
        this.guardian = {
            pref_notes: data.guardian?.pref_notes || '',
            pref_phone: data.guardian?.pref_phone || '',
            pref_email: data.guardian?.pref_email || ''
        };
        this.medical = {
            usesWheelchair: data.medical?.usesWheelchair === true,
            requiresOxygen: data.medical?.requiresOxygen === true
        };
    }

    static normalizeCouchDoc(raw = {}) {
        return {
            ...super.normalizeCouchDoc(raw),
            type: raw.type || 'VeteranApp',
            vet_type: raw.Conflict || 'WWII',
            service: {
                branch: raw['Branch-of-Service'] || '',
                dates: raw['Service-Dates'] || '',
                rank: raw.Rank || ''
            },
            guardian: {
                pref_notes: raw['Guardian-Preference'] || '',
                pref_phone: fixPhone(raw['Preferred-Guardian-Phone-Number']),
                pref_email: raw['Preferred-Guardian-Email'] || ''
            },
            medical: {
                usesWheelchair: isYes(raw['medical-wheelchair']),
                requiresOxygen: isYes(raw['medical-oxygen'])
            }
        };
    }

    legacyFields() {
        return {
            ...super.legacyFields(),
            Conflict: this.vet_type,
            'Branch-of-Service': this.service.branch,
            'Service-Dates': this.service.dates,
            Rank: this.service.rank,
            'Guardian-Preference': this.guardian.pref_notes,
            'Preferred-Guardian-Phone-Number': this.guardian.pref_phone,
            'Preferred-Guardian-Email': this.guardian.pref_email,
            'medical-wheelchair': yesNo(this.medical.usesWheelchair),
            'medical-oxygen': yesNo(this.medical.requiresOxygen)
        };
    }

    collectValidationErrors() {
        const errors = super.collectValidationErrors();
        if (this.vet_type && !VET_TYPES.includes(this.vet_type)) {
            errors.push('Invalid veteran type');
        }
        if (!SERVICE_BRANCHES.includes(this.service.branch)) {
            errors.push('Invalid service branch');
        }
        return errors;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            vet_type: this.vet_type,
            service: { ...this.service },
            guardian: { ...this.guardian },
            medical: { ...this.medical }
        };
    }

    /**
     * Guardian preference for the logistics record. The Veteran model has no
     * separate preference phone/email fields, so they are folded into the note.
     */
    guardianPreferenceNote() {
        const details = [];
        if (this.guardian.pref_phone) {
            details.push(`Phone: ${this.guardian.pref_phone}`);
        }
        if (this.guardian.pref_email) {
            details.push(`Email: ${this.guardian.pref_email}`);
        }
        if (details.length === 0) {
            return this.guardian.pref_notes;
        }
        const suffix = `(${details.join(', ')})`;
        return this.guardian.pref_notes ? `${this.guardian.pref_notes} ${suffix}` : suffix;
    }

    /**
     * Build the logistics Veteran record for this application (legacy
     * `acceptVetApp`). When `existingDoc` is supplied its unmapped fields
     * (flight, call, history, metadata, ...) are preserved.
     *
     * @param {Object|null} existingDoc - Current logistics document, if any
     * @param {{firstName: string, lastName: string}} user - Reviewer accepting the application
     * @returns {Veteran}
     */
    toVeteran(existingDoc = null, user) {
        const doc = existingDoc ? cloneDocument(existingDoc) : { _id: this._id };
        doc.type = 'Veteran';

        this.applyAcceptFields(doc, user);

        doc.vet_type = this.vet_type;
        doc.service = {
            ...(doc.service || {}),
            branch: this.service.branch === 'Unknown' ? '' : this.service.branch,
            dates: this.service.dates,
            rank: this.service.rank
        };
        doc.guardian = {
            ...(doc.guardian || {}),
            pref_notes: this.guardianPreferenceNote()
        };
        doc.medical = {
            ...(doc.medical || {}),
            usesWheelchair: this.medical.usesWheelchair,
            requiresOxygen: this.medical.requiresOxygen
        };

        return new Veteran(doc);
    }
}
