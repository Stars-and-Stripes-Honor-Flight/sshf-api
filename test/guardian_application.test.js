import { expect } from 'chai';
import { GuardianApplication } from '../models/guardian_application.js';
import { Guardian } from '../models/guardian.js';

function buildRawGuardianAppFixture(overrides = {}) {
    return {
        _id: 'a1b2c3',
        _rev: '3-xyz',
        type: 'GuardianApp',
        date_time: '2024-03-05 14:22:01',
        ip_address: '203.0.113.9',
        'First-Name': 'John',
        'Middle-Name': 'Q',
        'Last-Name': 'Public',
        'Nickname': 'Jack',
        Street: '123 Main St',
        City: 'Madison',
        County: 'Dane',
        State: 'wi',
        Zip: '53703',
        'Primary-Phone': '(608) 555-1234',
        'Mobile-Phone': '6085555678',
        from_email: 'john@example.com',
        'Date-Of-Birth': '05/17/1948',
        Gender: 'Male',
        'Shirt-Size': 'XL',
        'Emergency-Contact-Name': 'Jane Public',
        'Emergency-Contact-Phone': '608-555-9999',
        'Emergency-Contact-Email': 'jane@example.com',
        'Veteran-Preference': 'Father John Public',
        app_status: 'New',
        app_status_note: '',
        full_message: 'raw text',
        ...overrides
    };
}

describe('GuardianApplication Model', () => {
    describe('constructor defaults', () => {
        it('should default type to GuardianApp', () => {
            const app = new GuardianApplication();
            expect(app.type).to.equal('GuardianApp');
        });

        it('should default veteran.pref_notes to empty string', () => {
            const app = new GuardianApplication();
            expect(app.veteran).to.deep.equal({ pref_notes: '' });
        });
    });

    describe('fromCouchDoc', () => {
        it('should map Veteran-Preference to veteran.pref_notes', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            expect(app.veteran.pref_notes).to.equal('Father John Public');
        });
    });

    describe('toCouchDoc', () => {
        it('should write Veteran-Preference from veteran.pref_notes', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            const couchDoc = app.toCouchDoc();
            expect(couchDoc['Veteran-Preference']).to.equal('Father John Public');
        });
    });

    describe('toGuardian', () => {
        const acceptUser = { firstName: 'Admin', lastName: 'User' };

        it('should return a Guardian instance for a new record', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            const guardian = app.toGuardian(null, acceptUser);
            expect(guardian).to.be.instanceof(Guardian);
        });

        it('should map all accept fields for a new record', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            const guardian = app.toGuardian(null, acceptUser);

            expect(guardian._id).to.equal('a1b2c3');
            expect(guardian.type).to.equal('Guardian');
            expect(guardian.name).to.deep.equal({
                first: 'John', middle: 'Q', last: 'Public', nickname: 'Jack'
            });
            expect(guardian.address.street).to.equal('123 Main St');
            expect(guardian.address.city).to.equal('Madison');
            expect(guardian.address.county).to.equal('Dane');
            expect(guardian.address.state).to.equal('WI');
            expect(guardian.address.zip).to.equal('53703');
            expect(guardian.address.phone_day).to.equal('608-555-1234');
            expect(guardian.address.phone_mbl).to.equal('608-555-5678');
            expect(guardian.address.email).to.equal('john@example.com');
            expect(guardian.birth_date).to.equal('1948-05-17');
            expect(guardian.gender).to.equal('M');
            expect(guardian.emerg_contact.name).to.equal('Jane Public');
            expect(guardian.emerg_contact.address.phone).to.equal('608-555-9999');
            expect(guardian.emerg_contact.address.email).to.equal('jane@example.com');
            expect(guardian.shirt.size).to.equal('XL');
            expect(guardian.app_date).to.equal('2024-03-05');
            expect(guardian.veteran.pref_notes).to.equal('Father John Public');
            expect(guardian.veteran.pairings).to.be.an('array').that.is.empty;
            expect(guardian.veteran.history).to.be.an('array').that.is.empty;
            expect(guardian.metadata.created_by).to.equal('Online App (Admin User)');
        });

        it('should include Guardian constructor flight defaults for a new record', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            const guardian = app.toGuardian(null, acceptUser);

            expect(guardian.flight.status).to.equal('Active');
            expect(guardian.flight.training_complete).to.equal(false);
            expect(guardian.flight.paid).to.equal(false);
            expect(guardian.flight.booksOrdered).to.equal(0);
        });

        it('should preserve existing doc fields while overwriting app-mapped fields', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            const existingDoc = new Guardian({
                _id: 'a1b2c3',
                _rev: '5-abc',
                type: 'Guardian',
                name: { first: 'Old', middle: '', last: 'Name', nickname: '' },
                address: {
                    street: 'Old St',
                    city: 'Old City',
                    county: 'Old County',
                    state: 'IL',
                    zip: '60000',
                    phone_day: '217-555-0000',
                    phone_mbl: '',
                    email: 'old@example.com'
                },
                flight: {
                    id: 'SSHF-Nov2024',
                    status: 'Active',
                    training_complete: true,
                    paid: true,
                    booksOrdered: 2
                },
                veteran: {
                    pref_notes: 'Old preference',
                    pairings: [{ veteran_id: 'v1', name: 'Vet One' }],
                    history: [{ id: '2024-01-01T00:00:00Z', change: 'x' }]
                },
                metadata: {
                    created_by: 'Someone',
                    created_at: '2020-01-01T00:00:00Z'
                }
            }).toJSON();
            const existingSnapshot = JSON.parse(JSON.stringify(existingDoc));

            const guardian = app.toGuardian(existingDoc, acceptUser);

            expect(guardian._rev).to.equal('5-abc');
            expect(guardian.flight.id).to.equal('SSHF-Nov2024');
            expect(guardian.flight.training_complete).to.equal(true);
            expect(guardian.flight.paid).to.equal(true);
            expect(guardian.flight.booksOrdered).to.equal(2);
            expect(guardian.veteran.pairings).to.deep.equal([
                { veteran_id: 'v1', name: 'Vet One' }
            ]);
            expect(guardian.metadata.created_by).to.equal('Someone');
            expect(guardian.name.first).to.equal('John');
            expect(guardian.veteran.pref_notes).to.equal('Father John Public');
            expect(existingDoc).to.deep.equal(existingSnapshot);
        });

        it('should pass Guardian validate after prepareForSave for fixture data', () => {
            const app = GuardianApplication.fromCouchDoc(buildRawGuardianAppFixture());
            const guardian = app.toGuardian(null, acceptUser);
            guardian.prepareForSave(acceptUser);
            expect(guardian.address.phone_day).to.have.lengthOf(12);
            expect(guardian.validate()).to.equal(true);
        });
    });
});
