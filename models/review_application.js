import { trimStringValues } from '../utils/trim_strings.js';

/**
 * Base model for website applications awaiting review.
 *
 * Documents live in the separate review CouchDB database using the legacy
 * form field names (`First-Name`, `Primary-Phone`, `medical-wheelchair`, ...)
 * produced by the website form / hf_appcollector Cloud Function. This model
 * exposes a normalized shape to API clients (mirroring the Veteran/Guardian
 * models) and converts back to the legacy shape when saving so the raw
 * submission is preserved.
 */

export const REVIEW_APPLICATION_STATUSES = ['New', 'Hold', 'Accepted', 'Rejected', 'Trash'];
export const REVIEW_APPLICATION_TYPES = ['VeteranApp', 'GuardianApp'];

// Keys that the legacy Cloud Function passed through from the web form and
// that must never be persisted (CouchDB credentials and the raw message body).
export const INTAKE_STRIPPED_KEYS = ['cburi', 'cbusr', 'cbpwd', 'full_message'];

const DEFAULT_CREATED_BY = 'Online App';

/**
 * Normalize a phone number to NNN-NNN-NNNN when it contains exactly 10 digits.
 * Other values are returned unchanged; null/undefined become ''.
 */
export function fixPhone(phone) {
    if (phone === null || phone === undefined) {
        return '';
    }
    const raw = String(phone);
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 10) {
        return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }
    return raw;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function isValidYmd(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

/**
 * Parse a legacy date (MM/DD/YYYY, M/D/YYYY or YYYY-MM-DD) to ISO YYYY-MM-DD.
 * Returns '' when empty or unparsable.
 */
export function parseLegacyDate(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const text = String(value).trim();
    if (!text) {
        return '';
    }

    let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        const month = parseInt(match[1], 10);
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        return isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : '';
    }

    match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        return isValidYmd(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : '';
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

/**
 * Format an ISO YYYY-MM-DD date as the legacy MM/DD/YYYY string.
 */
export function formatLegacyDate(iso) {
    const match = typeof iso === 'string' ? iso.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    if (!match) {
        return '';
    }
    return `${match[2]}/${match[3]}/${match[1]}`;
}

/**
 * Derive the application date (YYYY-MM-DD) from the legacy `date_time` value
 * ("2024-03-05 14:22:01" or an ISO string).
 */
export function toAppDate(dateTime) {
    if (!dateTime || typeof dateTime !== 'string') {
        return '';
    }
    const text = dateTime.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
        return text.substring(0, 10);
    }
    const parsed = new Date(text.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    return parsed.toISOString().substring(0, 10);
}

/**
 * Derive a metadata timestamp (YYYY-MM-DDTHH:mm:ssZ) from the legacy `date_time`.
 */
export function toCreatedAt(dateTime) {
    if (!dateTime || typeof dateTime !== 'string') {
        return '';
    }
    const text = dateTime.trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (match) {
        return `${match[1]}T${match[2]}Z`;
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    return parsed.toISOString().split('.')[0] + 'Z';
}

function nowTimestamp() {
    return new Date().toISOString().split('.')[0] + 'Z';
}

function nowLegacyDateTime() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`
        + ` ${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`;
}

function normalizeGender(value) {
    const first = typeof value === 'string' ? value.trim().charAt(0).toUpperCase() : '';
    return first === 'F' ? 'F' : 'M';
}

function legacyGender(value) {
    return value === 'F' ? 'Female' : 'Male';
}

function userName(user) {
    if (!user) {
        return '';
    }
    if (typeof user === 'string') {
        return user;
    }
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

export class ReviewApplication {
    constructor(data = {}) {
        data = trimStringValues(data);
        this._id = data._id || '';
        this._rev = data._rev || '';
        this.type = data.type || '';
        this.app_status = data.app_status || 'New';
        this.app_status_note = data.app_status_note || '';
        this.date_time = data.date_time || '';
        this.app_date = toAppDate(this.date_time);
        this.ip_address = data.ip_address || '';
        this.accepted_as_rev = data.accepted_as_rev || '';
        this.name = {
            first: data.name?.first || '',
            middle: data.name?.middle || '',
            last: data.name?.last || '',
            nickname: data.name?.nickname || ''
        };
        this.address = {
            street: data.address?.street || '',
            city: data.address?.city || '',
            county: data.address?.county || '',
            state: (data.address?.state || '').toUpperCase(),
            zip: data.address?.zip || '',
            phone_day: data.address?.phone_day || '',
            phone_mbl: data.address?.phone_mbl || '',
            email: data.address?.email || ''
        };
        this.birth_date = data.birth_date || '';
        this.gender = data.gender || 'M';
        this.shirt = {
            size: data.shirt?.size || 'None'
        };
        this.emerg_contact = {
            name: data.emerg_contact?.name || '',
            address: {
                phone: data.emerg_contact?.address?.phone || '',
                email: data.emerg_contact?.address?.email || ''
            }
        };
        this.metadata = {
            created_at: data.metadata?.created_at || '',
            created_by: data.metadata?.created_by || '',
            updated_at: data.metadata?.updated_at || '',
            updated_by: data.metadata?.updated_by || ''
        };
    }

    /**
     * Map the shared legacy fields of a review document to the normalized shape.
     * Subclasses extend the returned object with type-specific fields.
     */
    static normalizeCouchDoc(raw = {}) {
        const metadata = raw.metadata || {};
        return {
            _id: raw._id || '',
            _rev: raw._rev || '',
            type: raw.type || '',
            app_status: raw.app_status || 'New',
            app_status_note: raw.app_status_note || '',
            date_time: raw.date_time || '',
            ip_address: raw.ip_address || '',
            accepted_as_rev: raw.acceptedAsRev || '',
            name: {
                first: raw['First-Name'] || '',
                middle: raw['Middle-Name'] || '',
                last: raw['Last-Name'] || '',
                nickname: raw['Nickname'] || ''
            },
            address: {
                street: raw.Street || '',
                city: raw.City || '',
                county: raw.County || '',
                state: (raw.State || '').toUpperCase(),
                zip: raw.Zip || '',
                phone_day: fixPhone(raw['Primary-Phone']),
                phone_mbl: fixPhone(raw['Mobile-Phone']),
                email: raw.from_email || ''
            },
            birth_date: parseLegacyDate(raw['Date-Of-Birth']) || parseLegacyDate(raw.birth_date),
            gender: normalizeGender(raw.Gender),
            shirt: {
                size: raw['Shirt-Size'] || 'None'
            },
            emerg_contact: {
                name: raw['Emergency-Contact-Name'] || '',
                address: {
                    phone: fixPhone(raw['Emergency-Contact-Phone']),
                    email: raw['Emergency-Contact-Email'] || ''
                }
            },
            metadata: {
                created_at: metadata.created_at || toCreatedAt(raw.date_time),
                created_by: metadata.created_by || DEFAULT_CREATED_BY,
                updated_at: metadata.updated_at || '',
                updated_by: metadata.updated_by || ''
            }
        };
    }

    /**
     * Build an instance from a legacy review document. The raw document is
     * kept (non-enumerable) so unknown fields survive a save round-trip.
     */
    static fromCouchDoc(raw = {}) {
        const app = new this(this.normalizeCouchDoc(raw));
        app.attachSourceDoc(raw);
        return app;
    }

    /**
     * Build an instance from a raw website form submission (legacy field
     * names). Credentials and the raw message are stripped and the document is
     * stamped as a brand-new application.
     */
    static fromIntakePayload(raw = {}) {
        const source = { ...raw };
        for (const key of INTAKE_STRIPPED_KEYS) {
            delete source[key];
        }
        delete source._id;
        delete source._rev;
        delete source.acceptedAsRev;
        if (!source.date_time) {
            source.date_time = nowLegacyDateTime();
        }

        const timestamp = nowTimestamp();
        const app = new this({
            ...this.normalizeCouchDoc(source),
            _id: '',
            _rev: '',
            app_status: 'New',
            app_status_note: '',
            accepted_as_rev: '',
            metadata: {
                created_at: timestamp,
                created_by: DEFAULT_CREATED_BY,
                updated_at: timestamp,
                updated_by: DEFAULT_CREATED_BY
            }
        });
        app.attachSourceDoc(source);
        return app;
    }

    attachSourceDoc(raw) {
        Object.defineProperty(this, 'sourceDoc', {
            value: raw,
            enumerable: false,
            writable: true,
            configurable: true
        });
    }

    /**
     * Legacy field values for the shared fields. Subclasses extend this.
     */
    legacyFields() {
        return {
            type: this.type,
            app_status: this.app_status,
            app_status_note: this.app_status_note,
            date_time: this.date_time,
            ip_address: this.ip_address,
            'First-Name': this.name.first,
            'Middle-Name': this.name.middle,
            'Last-Name': this.name.last,
            'Nickname': this.name.nickname,
            Street: this.address.street,
            City: this.address.city,
            County: this.address.county,
            State: (this.address.state || '').toUpperCase(),
            Zip: this.address.zip,
            'Primary-Phone': this.address.phone_day,
            'Mobile-Phone': this.address.phone_mbl,
            from_email: this.address.email,
            'Date-Of-Birth': formatLegacyDate(this.birth_date),
            Gender: legacyGender(this.gender),
            'Shirt-Size': this.shirt.size,
            'Emergency-Contact-Name': this.emerg_contact.name,
            'Emergency-Contact-Phone': this.emerg_contact.address.phone,
            'Emergency-Contact-Email': this.emerg_contact.address.email,
            metadata: { ...this.metadata }
        };
    }

    /**
     * Convert to the legacy CouchDB document shape, merged over the existing
     * raw document so fields this model does not know about are preserved.
     */
    toCouchDoc(existingRaw = this.sourceDoc || {}) {
        const doc = { ...existingRaw, ...this.legacyFields() };

        for (const key of INTAKE_STRIPPED_KEYS) {
            delete doc[key];
        }
        // birth_date is only a normalized field; Date-Of-Birth is the stored value
        delete doc.birth_date;

        if (this._id) {
            doc._id = this._id;
        } else {
            delete doc._id;
        }
        if (this._rev) {
            doc._rev = this._rev;
        } else {
            delete doc._rev;
        }
        if (this.accepted_as_rev) {
            doc.acceptedAsRev = this.accepted_as_rev;
        } else {
            delete doc.acceptedAsRev;
        }

        return doc;
    }

    /**
     * Collect validation errors for the shared fields. Subclasses push more.
     */
    collectValidationErrors() {
        const errors = [];

        if (!REVIEW_APPLICATION_TYPES.includes(this.type)) {
            errors.push('Application type must be VeteranApp or GuardianApp');
        }
        if (!REVIEW_APPLICATION_STATUSES.includes(this.app_status)) {
            errors.push('Invalid application status');
        }
        if (!this.name.first) {
            errors.push('First name is required');
        }
        if (!this.name.last) {
            errors.push('Last name is required');
        }
        if (this.gender && !['M', 'F'].includes(this.gender)) {
            errors.push('Gender must be M or F');
        }
        if (this.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(this.birth_date)) {
            errors.push('Birth date must be in YYYY-MM-DD format');
        }
        if (this.address.email && !/^[^@]+@[^@]+\.[^@]+$/.test(this.address.email)) {
            errors.push('Email must be a valid email address');
        }

        return errors;
    }

    validate() {
        const errors = this.collectValidationErrors();
        if (errors.length > 0) {
            throw new Error('Validation failed: ' + errors.join('; '));
        }
        return true;
    }

    // Update metadata before save (same timestamp format as Veteran/Guardian)
    prepareForSave(user) {
        const name = userName(user);
        const timestamp = nowTimestamp();

        this.metadata.updated_at = timestamp;
        this.metadata.updated_by = name;
        if (!this.metadata.created_at) {
            this.metadata.created_at = timestamp;
            this.metadata.created_by = name;
        }
    }

    toJSON() {
        return {
            _id: this._id,
            _rev: this._rev,
            type: this.type,
            app_status: this.app_status,
            app_status_note: this.app_status_note,
            date_time: this.date_time,
            app_date: this.app_date,
            ip_address: this.ip_address,
            accepted_as_rev: this.accepted_as_rev,
            name: { ...this.name },
            address: { ...this.address },
            birth_date: this.birth_date,
            gender: this.gender,
            shirt: { ...this.shirt },
            emerg_contact: {
                name: this.emerg_contact.name,
                address: { ...this.emerg_contact.address }
            },
            metadata: { ...this.metadata }
        };
    }

    /**
     * Apply the shared accept mapping onto a logistics document (plain object).
     * Used by VeteranApplication.toVeteran / GuardianApplication.toGuardian.
     */
    applyAcceptFields(doc, user) {
        const isNew = !doc.metadata || !doc.metadata.created_at;

        doc.name = {
            ...(doc.name || {}),
            first: this.name.first,
            middle: this.name.middle,
            last: this.name.last,
            nickname: this.name.nickname
        };
        doc.address = {
            ...(doc.address || {}),
            street: this.address.street,
            city: this.address.city,
            county: this.address.county,
            state: (this.address.state || '').toUpperCase(),
            zip: this.address.zip,
            phone_day: this.address.phone_day,
            phone_mbl: this.address.phone_mbl,
            email: this.address.email
        };
        doc.app_date = this.app_date;
        doc.birth_date = this.birth_date;
        doc.gender = this.gender;
        doc.emerg_contact = {
            ...(doc.emerg_contact || {}),
            name: this.emerg_contact.name,
            address: {
                ...((doc.emerg_contact && doc.emerg_contact.address) || {}),
                phone: this.emerg_contact.address.phone,
                email: this.emerg_contact.address.email
            }
        };
        doc.shirt = {
            ...(doc.shirt || {}),
            size: this.shirt.size
        };

        if (isNew) {
            doc.metadata = {
                ...(doc.metadata || {}),
                created_at: this.metadata.created_at,
                created_by: `${this.metadata.created_by || DEFAULT_CREATED_BY} (${userName(user)})`
            };
        }

        return doc;
    }
}

/**
 * Deep copy helper for plain JSON documents.
 */
export function cloneDocument(doc) {
    return doc ? JSON.parse(JSON.stringify(doc)) : {};
}
