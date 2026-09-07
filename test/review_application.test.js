import { expect } from 'chai';
import {
    ReviewApplication,
    REVIEW_APPLICATION_STATUSES,
    REVIEW_APPLICATION_TYPES,
    INTAKE_STRIPPED_KEYS,
    fixPhone,
    parseLegacyDate,
    formatLegacyDate,
    toAppDate,
    toCreatedAt
} from '../models/review_application.js';

function buildRawVeteranFixture(overrides = {}) {
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

function buildValidNormalizedApp(overrides = {}) {
    return {
        type: 'VeteranApp',
        app_status: 'New',
        name: { first: 'John', middle: 'Q', last: 'Public', nickname: 'Jack' },
        address: {
            street: '123 Main St',
            city: 'Madison',
            county: 'Dane',
            state: 'WI',
            zip: '53703',
            phone_day: '608-555-1234',
            phone_mbl: '608-555-5678',
            email: 'john@example.com'
        },
        birth_date: '1948-05-17',
        gender: 'M',
        shirt: { size: 'XL' },
        emerg_contact: {
            name: 'Jane Public',
            address: { phone: '608-555-9999', email: 'jane@example.com' }
        },
        date_time: '2024-03-05 14:22:01',
        ip_address: '203.0.113.9',
        metadata: {
            created_at: '2024-03-05T14:22:01Z',
            created_by: 'Online App',
            updated_at: '',
            updated_by: ''
        },
        ...overrides
    };
}

describe('ReviewApplication Model', () => {
    describe('constants', () => {
        it('should export REVIEW_APPLICATION_STATUSES with exact spec values', () => {
            expect(REVIEW_APPLICATION_STATUSES).to.deep.equal([
                'New', 'Hold', 'Accepted', 'Rejected', 'Trash'
            ]);
        });

        it('should export REVIEW_APPLICATION_TYPES with exact spec values', () => {
            expect(REVIEW_APPLICATION_TYPES).to.deep.equal(['VeteranApp', 'GuardianApp']);
        });

        it('should export INTAKE_STRIPPED_KEYS with exact spec values', () => {
            expect(INTAKE_STRIPPED_KEYS).to.deep.equal([
                'cburi', 'cbusr', 'cbpwd', 'full_message'
            ]);
        });
    });

    describe('fixPhone', () => {
        it('should format 10-digit phone with punctuation to NNN-NNN-NNNN', () => {
            expect(fixPhone('(608) 555-1234')).to.equal('608-555-1234');
        });

        it('should format bare 10-digit phone to NNN-NNN-NNNN', () => {
            expect(fixPhone('6085555678')).to.equal('608-555-5678');
        });

        it('should return short numbers unchanged', () => {
            expect(fixPhone('555-1234')).to.equal('555-1234');
        });

        it('should return empty string for undefined', () => {
            expect(fixPhone(undefined)).to.equal('');
        });

        it('should return empty string for null', () => {
            expect(fixPhone(null)).to.equal('');
        });
    });

    describe('parseLegacyDate', () => {
        it('should parse MM/DD/YYYY to ISO', () => {
            expect(parseLegacyDate('05/17/1948')).to.equal('1948-05-17');
        });

        it('should parse M/D/YYYY to ISO', () => {
            expect(parseLegacyDate('5/7/1948')).to.equal('1948-05-07');
        });

        it('should pass through YYYY-MM-DD', () => {
            expect(parseLegacyDate('1948-05-17')).to.equal('1948-05-17');
        });

        it('should return empty string for empty input', () => {
            expect(parseLegacyDate('')).to.equal('');
        });

        it('should return empty string for undefined', () => {
            expect(parseLegacyDate(undefined)).to.equal('');
        });

        it('should return empty string for unparsable garbage', () => {
            expect(parseLegacyDate('garbage')).to.equal('');
        });
    });

    describe('formatLegacyDate', () => {
        it('should format ISO date to MM/DD/YYYY', () => {
            expect(formatLegacyDate('1948-05-17')).to.equal('05/17/1948');
        });

        it('should return empty string for empty input', () => {
            expect(formatLegacyDate('')).to.equal('');
        });
    });

    describe('toAppDate', () => {
        it('should extract date from legacy date_time string', () => {
            expect(toAppDate('2024-03-05 14:22:01')).to.equal('2024-03-05');
        });

        it('should extract date from ISO date_time string', () => {
            expect(toAppDate('2024-03-05T14:22:01Z')).to.equal('2024-03-05');
        });

        it('should return empty string for empty input', () => {
            expect(toAppDate('')).to.equal('');
        });
    });

    describe('toCreatedAt', () => {
        it('should convert legacy date_time to ISO seconds with Z suffix', () => {
            const result = toCreatedAt('2024-03-05 14:22:01');
            expect(result).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(result.startsWith('2024-03-05T')).to.equal(true);
        });
    });

    describe('constructor', () => {
        it('should apply spec defaults for empty input', () => {
            const app = new ReviewApplication();
            expect(app._id).to.equal('');
            expect(app._rev).to.equal('');
            expect(app.type).to.equal('');
            expect(app.app_status).to.equal('New');
            expect(app.app_status_note).to.equal('');
            expect(app.date_time).to.equal('');
            expect(app.app_date).to.equal('');
            expect(app.ip_address).to.equal('');
            expect(app.accepted_as_rev).to.equal('');
            expect(app.gender).to.equal('M');
            expect(app.birth_date).to.equal('');
            expect(app.name).to.deep.equal({
                first: '', middle: '', last: '', nickname: ''
            });
            expect(app.address).to.deep.equal({
                street: '', city: '', county: '', state: '', zip: '',
                phone_day: '', phone_mbl: '', email: ''
            });
            expect(app.shirt).to.deep.equal({ size: 'None' });
            expect(app.emerg_contact).to.deep.equal({
                name: '',
                address: { phone: '', email: '' }
            });
            expect(app.metadata).to.deep.equal({
                created_at: '', created_by: '', updated_at: '', updated_by: ''
            });
        });

        it('should derive app_date from date_time and ignore input app_date', () => {
            const app = new ReviewApplication({
                date_time: '2024-03-05 14:22:01',
                app_date: '1999-01-01'
            });
            expect(app.app_date).to.equal('2024-03-05');
        });

        it('should trim leading and trailing whitespace from string values', () => {
            const app = new ReviewApplication({
                name: { first: '  John  ', last: 'Public' }
            });
            expect(app.name.first).to.equal('John');
        });
    });

    describe('fromCouchDoc', () => {
        let rawFixture;

        beforeEach(() => {
            rawFixture = buildRawVeteranFixture();
        });

        it('should map all shared legacy fields to normalized form', () => {
            const app = ReviewApplication.fromCouchDoc(rawFixture);

            expect(app._id).to.equal('a1b2c3');
            expect(app._rev).to.equal('3-xyz');
            expect(app.type).to.equal('VeteranApp');
            expect(app.name).to.deep.equal({
                first: 'John', middle: 'Q', last: 'Public', nickname: 'Jack'
            });
            expect(app.address.street).to.equal('123 Main St');
            expect(app.address.city).to.equal('Madison');
            expect(app.address.county).to.equal('Dane');
            expect(app.address.state).to.equal('WI');
            expect(app.address.zip).to.equal('53703');
            expect(app.address.phone_day).to.equal('608-555-1234');
            expect(app.address.phone_mbl).to.equal('608-555-5678');
            expect(app.address.email).to.equal('john@example.com');
            expect(app.birth_date).to.equal('1948-05-17');
            expect(app.gender).to.equal('M');
            expect(app.shirt.size).to.equal('XL');
            expect(app.emerg_contact.name).to.equal('Jane Public');
            expect(app.emerg_contact.address.phone).to.equal('608-555-9999');
            expect(app.emerg_contact.address.email).to.equal('jane@example.com');
            expect(app.app_status).to.equal('New');
            expect(app.app_status_note).to.equal('');
            expect(app.date_time).to.equal('2024-03-05 14:22:01');
            expect(app.app_date).to.equal('2024-03-05');
            expect(app.ip_address).to.equal('203.0.113.9');
            expect(app.accepted_as_rev).to.equal('');
        });

        it('should default metadata when raw doc has no metadata', () => {
            const app = ReviewApplication.fromCouchDoc(rawFixture);
            expect(app.metadata.created_by).to.equal('Online App');
            expect(app.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(app.metadata.created_at.startsWith('2024-03-05T')).to.equal(true);
        });

        it('should map acceptedAsRev to accepted_as_rev', () => {
            const app = ReviewApplication.fromCouchDoc(
                buildRawVeteranFixture({ acceptedAsRev: '5-abc123' })
            );
            expect(app.accepted_as_rev).to.equal('5-abc123');
        });

        it('should default app_status to New when missing', () => {
            const raw = buildRawVeteranFixture();
            delete raw.app_status;
            const app = ReviewApplication.fromCouchDoc(raw);
            expect(app.app_status).to.equal('New');
        });

        it('should default app_status_note to empty when missing', () => {
            const raw = buildRawVeteranFixture();
            delete raw.app_status_note;
            const app = ReviewApplication.fromCouchDoc(raw);
            expect(app.app_status_note).to.equal('');
        });

        it('should map Gender Female to F', () => {
            const app = ReviewApplication.fromCouchDoc(
                buildRawVeteranFixture({ Gender: 'Female' })
            );
            expect(app.gender).to.equal('F');
        });

        it('should map Gender F to F', () => {
            const app = ReviewApplication.fromCouchDoc(
                buildRawVeteranFixture({ Gender: 'F' })
            );
            expect(app.gender).to.equal('F');
        });

        it('should default gender to M when Gender is missing', () => {
            const raw = buildRawVeteranFixture();
            delete raw.Gender;
            const app = ReviewApplication.fromCouchDoc(raw);
            expect(app.gender).to.equal('M');
        });

        it('should read birth_date fallback when Date-Of-Birth is absent', () => {
            const raw = buildRawVeteranFixture();
            delete raw['Date-Of-Birth'];
            raw.birth_date = '1948-05-17';
            const app = ReviewApplication.fromCouchDoc(raw);
            expect(app.birth_date).to.equal('1948-05-17');
        });
    });

    describe('toCouchDoc', () => {
        it('should write legacy keys after fromCouchDoc round-trip', () => {
            const raw = buildRawVeteranFixture({ some_unknown_key: 'kept' });
            const app = ReviewApplication.fromCouchDoc(raw);
            const couchDoc = app.toCouchDoc();

            expect(couchDoc['First-Name']).to.equal('John');
            expect(couchDoc['Primary-Phone']).to.equal('608-555-1234');
            expect(couchDoc['Date-Of-Birth']).to.equal('05/17/1948');
            expect(couchDoc.Gender).to.equal('Male');
            expect(couchDoc.State).to.equal('WI');
            expect(couchDoc.some_unknown_key).to.equal('kept');
        });

        it('should write Female gender as Female', () => {
            const app = ReviewApplication.fromCouchDoc(
                buildRawVeteranFixture({ Gender: 'Female' })
            );
            const couchDoc = app.toCouchDoc();
            expect(couchDoc.Gender).to.equal('Female');
        });

        it('should not include intake stripped keys or birth_date normalized key', () => {
            const raw = buildRawVeteranFixture({ some_unknown_key: 'kept' });
            const app = ReviewApplication.fromCouchDoc(raw);
            const couchDoc = app.toCouchDoc();

            expect(couchDoc).to.not.have.property('full_message');
            expect(couchDoc).to.not.have.property('cburi');
            expect(couchDoc).to.not.have.property('cbusr');
            expect(couchDoc).to.not.have.property('cbpwd');
            expect(couchDoc).to.not.have.property('birth_date');
        });

        it('should not mutate the source raw object', () => {
            const raw = buildRawVeteranFixture({ some_unknown_key: 'kept' });
            const rawSnapshot = JSON.parse(JSON.stringify(raw));
            const app = ReviewApplication.fromCouchDoc(raw);
            app.toCouchDoc();
            expect(raw).to.deep.equal(rawSnapshot);
        });

        it('should omit acceptedAsRev when accepted_as_rev is empty', () => {
            const app = ReviewApplication.fromCouchDoc(buildRawVeteranFixture());
            const couchDoc = app.toCouchDoc();
            expect(couchDoc).to.not.have.property('acceptedAsRev');
        });

        it('should write acceptedAsRev only when non-empty', () => {
            const app = ReviewApplication.fromCouchDoc(
                buildRawVeteranFixture({ acceptedAsRev: '5-abc123' })
            );
            const couchDoc = app.toCouchDoc();
            expect(couchDoc.acceptedAsRev).to.equal('5-abc123');
        });

        it('should omit _id and _rev when they are empty strings', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({ _id: '', _rev: '' }));
            const couchDoc = app.toCouchDoc({});
            expect(couchDoc).to.not.have.property('_id');
            expect(couchDoc).to.not.have.property('_rev');
        });

        it('should merge over an explicit existingRaw argument', () => {
            const raw = buildRawVeteranFixture({ some_unknown_key: 'kept' });
            const app = ReviewApplication.fromCouchDoc(raw);
            const existingRaw = { custom_field: 'preserved', 'First-Name': 'Old' };
            const couchDoc = app.toCouchDoc(existingRaw);

            expect(couchDoc.custom_field).to.equal('preserved');
            expect(couchDoc['First-Name']).to.equal('John');
        });
    });

    describe('fromIntakePayload', () => {
        it('should strip INTAKE_STRIPPED_KEYS from resulting toCouchDoc output', () => {
            const raw = buildRawVeteranFixture({
                cburi: 'http://example.com',
                cbusr: 'user',
                cbpwd: 'pass',
                full_message: 'secret body'
            });
            const app = ReviewApplication.fromIntakePayload(raw);
            const couchDoc = app.toCouchDoc();

            expect(couchDoc).to.not.have.property('cburi');
            expect(couchDoc).to.not.have.property('cbusr');
            expect(couchDoc).to.not.have.property('cbpwd');
            expect(couchDoc).to.not.have.property('full_message');
        });

        it('should force app_status to New', () => {
            const raw = buildRawVeteranFixture({ app_status: 'Hold' });
            const app = ReviewApplication.fromIntakePayload(raw);
            expect(app.app_status).to.equal('New');
        });

        it('should set metadata created_by and updated_by to Online App', () => {
            const app = ReviewApplication.fromIntakePayload(buildRawVeteranFixture());
            expect(app.metadata.created_by).to.equal('Online App');
            expect(app.metadata.updated_by).to.equal('Online App');
        });

        it('should set metadata created_at and updated_at to ISO seconds with Z', () => {
            const app = ReviewApplication.fromIntakePayload(buildRawVeteranFixture());
            expect(app.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(app.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('should default date_time to YYYY-MM-DD HH:mm:ss when missing', () => {
            const raw = buildRawVeteranFixture();
            delete raw.date_time;
            const app = ReviewApplication.fromIntakePayload(raw);
            expect(app.date_time).to.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });

        it('should keep provided date_time when present', () => {
            const app = ReviewApplication.fromIntakePayload(buildRawVeteranFixture());
            expect(app.date_time).to.equal('2024-03-05 14:22:01');
        });
    });

    describe('validate', () => {
        it('should return true for a valid instance', () => {
            const app = new ReviewApplication(buildValidNormalizedApp());
            expect(app.validate()).to.equal(true);
        });

        it('should throw for invalid application type', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({ type: 'Invalid' }));
            expect(() => app.validate()).to.throw(/Validation failed/);
            expect(() => app.validate()).to.throw(/VeteranApp or GuardianApp/);
        });

        it('should throw for invalid app_status', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({ app_status: 'Pending' }));
            expect(() => app.validate()).to.throw(/Validation failed/);
            expect(() => app.validate()).to.throw(/Invalid application status/);
        });

        it('should throw when first name is missing', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({
                name: { first: '', middle: '', last: 'Public', nickname: '' }
            }));
            expect(() => app.validate()).to.throw(/Validation failed/);
            expect(() => app.validate()).to.throw(/First name is required/);
        });

        it('should throw when last name is missing', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({
                name: { first: 'John', middle: '', last: '', nickname: '' }
            }));
            expect(() => app.validate()).to.throw(/Validation failed/);
            expect(() => app.validate()).to.throw(/Last name is required/);
        });

        it('should throw for invalid gender', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({ gender: 'X' }));
            expect(() => app.validate()).to.throw(/Validation failed/);
        });

        it('should throw for birth_date in wrong format', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({ birth_date: '05/17/1948' }));
            expect(() => app.validate()).to.throw(/Validation failed/);
        });

        it('should throw for invalid email', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({
                address: {
                    street: '123 Main St',
                    city: 'Madison',
                    county: 'Dane',
                    state: 'WI',
                    zip: '53703',
                    phone_day: '608-555-1234',
                    phone_mbl: '608-555-5678',
                    email: 'not-an-email'
                }
            }));
            expect(() => app.validate()).to.throw(/Validation failed/);
        });
    });

    describe('prepareForSave', () => {
        it('should set updated_by and updated_at from user', () => {
            const app = new ReviewApplication(buildValidNormalizedApp());
            app.prepareForSave({ firstName: 'Admin', lastName: 'User' });
            expect(app.metadata.updated_by).to.equal('Admin User');
            expect(app.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('should set created fields only when created_at is empty', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({
                metadata: {
                    created_at: '2024-01-01T00:00:00Z',
                    created_by: 'Existing Creator',
                    updated_at: '',
                    updated_by: ''
                }
            }));
            app.prepareForSave({ firstName: 'Admin', lastName: 'User' });
            expect(app.metadata.created_at).to.equal('2024-01-01T00:00:00Z');
            expect(app.metadata.created_by).to.equal('Existing Creator');
        });

        it('should set created fields when created_at is empty', () => {
            const app = new ReviewApplication(buildValidNormalizedApp({
                metadata: { created_at: '', created_by: '', updated_at: '', updated_by: '' }
            }));
            app.prepareForSave({ firstName: 'Admin', lastName: 'User' });
            expect(app.metadata.created_by).to.equal('Admin User');
            expect(app.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });
    });

    describe('toJSON', () => {
        it('should contain normalized keys and exclude sourceDoc', () => {
            const app = ReviewApplication.fromCouchDoc(buildRawVeteranFixture());
            const json = app.toJSON();

            expect(json).to.have.property('_id', 'a1b2c3');
            expect(json).to.have.property('name');
            expect(json).to.have.property('address');
            expect(json).to.have.property('metadata');
            expect(json).to.not.have.property('sourceDoc');
        });

        it('should exclude sourceDoc from Object.keys', () => {
            const app = ReviewApplication.fromCouchDoc(buildRawVeteranFixture());
            expect(Object.keys(app)).to.not.include('sourceDoc');
        });
    });
});
