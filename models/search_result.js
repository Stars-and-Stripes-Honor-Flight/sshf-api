export class SearchResult {
    constructor(data) {
        this.type = data.type;
        this.name = data.name;
        this.city = data.city;
        this.appdate = data.appdate;
        this.flight = data.flight;
        this.status = data.status;
        this.pairing = data.pairing;
        this.pairingId = data.pairingId;
    }

    // Getter methods
    getType() { return this.type; }
    getName() { return this.name; }
    getCity() { return this.city; }
    getAppDate() { return this.appdate; }
    getFlight() { return this.flight; }
    getStatus() { return this.status; }
    getPairing() { return this.pairing; }
    getPairingId() { return this.pairingId; }

    // Convert to JSON object
    toJSON() {
        return {
            type: this.type,
            name: this.name,
            city: this.city,
            appdate: this.appdate,
            flight: this.flight,
            status: this.status,
            pairing: this.pairing,
            pairingId: this.pairingId
        };
    }
} 