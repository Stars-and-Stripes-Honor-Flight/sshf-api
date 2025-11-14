export class UnpairedVeteranResults {
    constructor(data) {
        this.results = data.rows.map(row => ({
            id: row.id,
            name: row.value.name || '',
            city: row.value.city || '',
            flight: row.value.flight || '',
            prefs: row.value.prefs || ''
        }));
    }

    // Getter method
    getResults() {
        return this.results;
    }

    // Convert to JSON object - returns array directly
    toJSON() {
        return this.results;
    }
}

