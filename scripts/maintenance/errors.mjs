export class MaintenanceError extends Error {
    constructor(message, { code } = {}) {
        super(message);
        this.name = 'MaintenanceError';
        this.code = code;
    }
}