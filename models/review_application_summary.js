/**
 * One row of the review application list, built from a row of the legacy
 * `hf-app-review/new_apps` CouchDB view.
 */
export class ReviewApplicationSummary {
    constructor(row = {}) {
        const value = row.value || {};
        this.id = row.id || '';
        this.type = value.type || '';
        this.name = value.name || '';
        this.city = value.city || '';
        this.app_date = typeof value.appdate === 'string' ? value.appdate.substring(0, 10) : '';
        this.app_status = value.app_status || 'New';
        this.pairing = value.pairing || '';
        this.email = value.email || '';
        this.ip_address = value.ipaddr || '';
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            city: this.city,
            app_date: this.app_date,
            app_status: this.app_status,
            pairing: this.pairing,
            email: this.email,
            ip_address: this.ip_address
        };
    }
}
