import { ReviewApplication, cloneDocument } from './review_application.js';
import { Guardian } from './guardian.js';

/**
 * Guardian application awaiting review (legacy type `GuardianApp`).
 */
export class GuardianApplication extends ReviewApplication {
    constructor(data = {}) {
        super({ ...data, type: data.type || 'GuardianApp' });
        this.veteran = {
            pref_notes: data.veteran?.pref_notes || ''
        };
    }

    static normalizeCouchDoc(raw = {}) {
        return {
            ...super.normalizeCouchDoc(raw),
            type: raw.type || 'GuardianApp',
            veteran: {
                pref_notes: raw['Veteran-Preference'] || ''
            }
        };
    }

    legacyFields() {
        return {
            ...super.legacyFields(),
            'Veteran-Preference': this.veteran.pref_notes
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            veteran: { ...this.veteran }
        };
    }

    /**
     * Build the logistics Guardian record for this application (legacy
     * `acceptGrdApp`). When `existingDoc` is supplied its unmapped fields
     * (flight, pairings, history, metadata, ...) are preserved.
     *
     * @param {Object|null} existingDoc - Current logistics document, if any
     * @param {{firstName: string, lastName: string}} user - Reviewer accepting the application
     * @returns {Guardian}
     */
    toGuardian(existingDoc = null, user) {
        const doc = existingDoc ? cloneDocument(existingDoc) : { _id: this._id };
        doc.type = 'Guardian';

        this.applyAcceptFields(doc, user);

        doc.veteran = {
            ...(doc.veteran || {}),
            pref_notes: this.veteran.pref_notes
        };

        return new Guardian(doc);
    }
}
