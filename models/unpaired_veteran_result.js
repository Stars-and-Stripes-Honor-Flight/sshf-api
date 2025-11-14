export class UnpairedVeteranResult {
    constructor(data) {
        this.name = data.name || '';
        this.city = data.city || '';
        this.flight = data.flight || '';
        this.prefs = data.prefs || '';
    }

    // Getter methods
    getName() { return this.name; }
    getCity() { return this.city; }
    getFlight() { return this.flight; }
    getPrefs() { return this.prefs; }

    // Convert to JSON object
    toJSON() {
        return {
            name: this.name,
            city: this.city,
            flight: this.flight,
            prefs: this.prefs
        };
    }
}

