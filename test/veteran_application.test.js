import { expect } from 'chai';
import { VeteranApplication } from '../models/veteran_application.js';
import { Veteran } from '../models/veteran.js';

function buildRawVeteranAppFixture(overrides = {}) {
    return {
        _id: 'a1b2c3',
        _rev: '3-xyz',
        type: 'VeteranApp',
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
        Conflict: 'Vietnam',
        'Branch-of-Service': 'Army',
        'Service-Dates': '1966-1968',
        Rank: 'SGT',
        'Emergency-Contact-Name': 'Jane Public',
        'Emergency-Contact-Phone': '608-555-9999',
        'Emergency-Contact-Email': 'jane@example.com',
        'medical-wheelchair': 'Yes',
        'medical-oxygen': 'No',
        'Guardian-Preference': 'Son Bob',
        'Preferred-Guardian-Phone-Number': '6085550000',
        'Preferred-Guardian-Email': 'bob@example.com',
        app_status: 'New',
        app_status_note: '',
        full_message: 'raw text',
        ...overrides
    };
}

describe('VeteranApplication Model', () => {
    describe('constructor defaults', () => {
        it('should default type to VeteranApp', () => {
            const app = new VeteranApplication();
            expect(app.type).to.equal('VeteranApp');
        });

        it('should default vet_type to WWII', () => {
            const app = new VeteranApplication();
            expect(app.vet_type).to.equal('WWII');
        });

        it('should default service fields to empty strings', () => {
            const app = new VeteranApplication();
            expect(app.service).to.deep.equal({ branch: '', dates: '', rank: '' });
        });

        it('should default guardian preference fields to empty strings', () => {
            const app = new VeteranApplication();
            expect(app.guardian).to.deep.equal({
                pref_notes: '', pref_phone: '', pref_email: ''
            });
        });

        it('should default medical booleans to false', () => {
            const app = new VeteranApplication();
            expect(app.medical).to.deep.equal({
                usesWheelchair: false,
                requiresOxygen: false
            });
        });
    });

    describe('fromCouchDoc', () => {
        it('should map veteran-specific legacy fields', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());

            expect(app.vet_type).to.equal('Vietnam');
            expect(app.service.branch).to.equal('Army');
            expect(app.service.dates).to.equal('1966-1968');
            expect(app.service.rank).to.equal('SGT');
            expect(app.guardian.pref_notes).to.equal('Son Bob');
            expect(app.guardian.pref_phone).to.equal('608-555-0000');
            expect(app.guardian.pref_email).to.equal('bob@example.com');
            expect(app.medical.usesWheelchair).to.equal(true);
            expect(app.medical.requiresOxygen).to.equal(false);
        });

        it('should default vet_type to WWII when Conflict is missing', () => {
            const raw = buildRawVeteranAppFixture();
            delete raw.Conflict;
            const app = VeteranApplication.fromCouchDoc(raw);
            expect(app.vet_type).to.equal('WWII');
        });
    });

    describe('toCouchDoc', () => {
        it('should write veteran-specific legacy keys', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());
            const couchDoc = app.toCouchDoc();

            expect(couchDoc.Conflict).to.equal('Vietnam');
            expect(couchDoc['Branch-of-Service']).to.equal('Army');
            expect(couchDoc['Service-Dates']).to.equal('1966-1968');
            expect(couchDoc.Rank).to.equal('SGT');
            expect(couchDoc['Guardian-Preference']).to.equal('Son Bob');
            expect(couchDoc['Preferred-Guardian-Phone-Number']).to.equal('608-555-0000');
            expect(couchDoc['Preferred-Guardian-Email']).to.equal('bob@example.com');
            expect(couchDoc['medical-wheelchair']).to.equal('Yes');
            expect(couchDoc['medical-oxygen']).to.equal('No');
        });

        it('should write medical booleans as Yes and No', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({
                    'medical-wheelchair': 'No',
                    'medical-oxygen': 'Yes'
                })
            );
            const couchDoc = app.toCouchDoc();
            expect(couchDoc['medical-wheelchair']).to.equal('No');
            expect(couchDoc['medical-oxygen']).to.equal('Yes');
        });
    });

    describe('validate', () => {
        it('should throw for invalid vet_type', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({ Conflict: 'InvalidWar' })
            );
            expect(() => app.validate()).to.throw(/Validation failed/);
        });

        it('should throw for invalid service branch', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({ 'Branch-of-Service': 'Space Force' })
            );
            expect(() => app.validate()).to.throw(/Validation failed/);
        });

        it('should accept empty service branch', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({ 'Branch-of-Service': '' })
            );
            expect(app.validate()).to.equal(true);
        });

        it('should accept Unknown service branch', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({ 'Branch-of-Service': 'Unknown' })
            );
            expect(app.validate()).to.equal(true);
        });
    });

    describe('toVeteran', () => {
        const acceptUser = { firstName: 'Admin', lastName: 'User' };

        it('should return a Veteran instance for a new record', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());
            const veteran = app.toVeteran(null, acceptUser);
            expect(veteran).to.be.instanceof(Veteran);
        });

        it('should map all accept fields for a new record', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());
            const veteran = app.toVeteran(null, acceptUser);

            expect(veteran._id).to.equal('a1b2c3');
            expect(veteran.type).to.equal('Veteran');
            expect(veteran.name).to.deep.equal({
                first: 'John', middle: 'Q', last: 'Public', nickname: 'Jack'
            });
            expect(veteran.address.street).to.equal('123 Main St');
            expect(veteran.address.city).to.equal('Madison');
            expect(veteran.address.county).to.equal('Dane');
            expect(veteran.address.state).to.equal('WI');
            expect(veteran.address.zip).to.equal('53703');
            expect(veteran.address.phone_day).to.equal('608-555-1234');
            expect(veteran.address.phone_mbl).to.equal('608-555-5678');
            expect(veteran.address.email).to.equal('john@example.com');
            expect(veteran.app_date).to.equal('2024-03-05');
            expect(veteran.birth_date).to.equal('1948-05-17');
            expect(veteran.gender).to.equal('M');
            expect(veteran.vet_type).to.equal('Vietnam');
            expect(veteran.service.branch).to.equal('Army');
            expect(veteran.service.dates).to.equal('1966-1968');
            expect(veteran.service.rank).to.equal('SGT');
            expect(veteran.emerg_contact.name).to.equal('Jane Public');
            expect(veteran.emerg_contact.address.phone).to.equal('608-555-9999');
            expect(veteran.emerg_contact.address.email).to.equal('jane@example.com');
            expect(veteran.medical.usesWheelchair).to.equal(true);
            expect(veteran.medical.requiresOxygen).to.equal(false);
            expect(veteran.shirt.size).to.equal('XL');
            expect(veteran.guardian.pref_notes).to.equal(
                'Son Bob (Phone: 608-555-0000, Email: bob@example.com)'
            );
            expect(veteran.metadata.created_at).to.equal(app.metadata.created_at);
            expect(veteran.metadata.created_by).to.equal('Online App (Admin User)');
        });

        it('should include Veteran constructor defaults for a new record', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());
            const veteran = app.toVeteran(null, acceptUser);

            expect(veteran.flight.status).to.equal('Active');
            expect(veteran.flight.id).to.equal('None');
            expect(veteran.flight.bus).to.equal('None');
            expect(veteran.call.history).to.be.an('array').that.is.empty;
            expect(veteran.guardian.history).to.be.an('array').that.is.empty;
        });

        it('should map Unknown branch to empty string', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({ 'Branch-of-Service': 'Unknown' })
            );
            const veteran = app.toVeteran(null, acceptUser);
            expect(veteran.service.branch).to.equal('');
        });

        it('should leave pref_notes unchanged when phone and email are absent', () => {
            const app = VeteranApplication.fromCouchDoc(
                buildRawVeteranAppFixture({
                    'Guardian-Preference': 'Son Bob',
                    'Preferred-Guardian-Phone-Number': '',
                    'Preferred-Guardian-Email': ''
                })
            );
            const veteran = app.toVeteran(null, acceptUser);
            expect(veteran.guardian.pref_notes).to.equal('Son Bob');
        });

        it('should preserve existing doc fields while overwriting app-mapped fields', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());
            const existingDoc = new Veteran({
                _id: 'a1b2c3',
                _rev: '5-abc',
                type: 'Veteran',
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
                    status: 'Active'
                },
                call: {
                    assigned_to: 'Caller'
                },
                guardian: {
                    history: [{ id: '2024-01-01T00:00:00Z', change: 'x' }]
                },
                metadata: {
                    created_by: 'Someone',
                    created_at: '2020-01-01T00:00:00Z'
                }
            }).toJSON();
            const existingSnapshot = JSON.parse(JSON.stringify(existingDoc));

            const veteran = app.toVeteran(existingDoc, acceptUser);

            expect(veteran._rev).to.equal('5-abc');
            expect(veteran.flight.id).to.equal('SSHF-Nov2024');
            expect(veteran.call.assigned_to).to.equal('Caller');
            expect(veteran.guardian.history).to.deep.equal([
                { id: '2024-01-01T00:00:00Z', change: 'x' }
            ]);
            expect(veteran.metadata.created_by).to.equal('Someone');
            expect(veteran.name.first).to.equal('John');
            expect(veteran.address.city).to.equal('Madison');
            expect(existingDoc).to.deep.equal(existingSnapshot);
        });

        it('should pass Veteran validate after prepareForSave for fixture data', () => {
            const app = VeteranApplication.fromCouchDoc(buildRawVeteranAppFixture());
            const veteran = app.toVeteran(null, acceptUser);
            veteran.prepareForSave(acceptUser);
            expect(veteran.address.phone_day).to.have.lengthOf(12);
            expect(veteran.validate()).to.equal(true);
        });
    });
});
