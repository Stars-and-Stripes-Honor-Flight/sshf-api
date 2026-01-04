export class RecentActivityEntry {
    constructor(data = {}) {
        this.id = data.id || '';
        this.type = data.type || '';
        this.name = data.name || '';
        this.city = data.city || '';
        this.appdate = data.appdate || '';
        this.recdate = data.recdate || '';
        this.recby = data.recby || '';
        this.change = data.change || '';
    }

    /**
     * Creates a RecentActivityEntry from a CouchDB view row
     * @param {Object} row - A row from the CouchDB view response
     * @returns {RecentActivityEntry}
     */
    static fromRow(row) {
        return new RecentActivityEntry({
            id: row.id,
            type: row.value?.type,
            name: row.value?.name,
            city: row.value?.city,
            appdate: row.value?.appdate,
            recdate: row.value?.recdate,
            recby: row.value?.recby,
            change: row.value?.change
        });
    }

    /**
     * Convert to JSON object
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            city: this.city,
            appdate: this.appdate,
            recdate: this.recdate,
            recby: this.recby,
            change: this.change
        };
    }
}

