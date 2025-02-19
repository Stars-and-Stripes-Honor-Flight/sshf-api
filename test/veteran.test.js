import { expect } from 'chai';
import { Veteran } from '../models/veteran.js';

describe('Veteran Model', () => {
    let baseSampleData, sampleVeteranData;

    beforeEach(() => {
        // Define base sample data
        baseSampleData = {
            type: 'Veteran',
            name: {
                first: 'John',
                middle: 'Robert',
                last: 'Smith',
                nickname: 'Johnny'
            },
            birth_date: '1945-01-01',
            gender: 'M',
            address: {
                street: '123 Main St',
                city: 'Springfield',
                state: 'IL',
                zip: '62701',
                county: 'Sangamon',
                phone_day: '217-555-1234',
                phone_eve: '217-555-5678',
                phone_mbl: '217-555-9012',
                email: 'john.smith@email.com'
            },
            service: {
                branch: 'Army',
                rank: 'Sergeant',
                dates: '1965-1968',
                activity: 'Vietnam War'
            },
            flight: {
                id: 'SSHF-2024',
                status: 'Active',
                bus: 'Alpha1',
                seat: '1A'
            },
            medical: {
                level: '2',
                food_restriction: 'None'
            },
            weight: '180'
        };

        // Deep clone the sample data for each test
        sampleVeteranData = JSON.parse(JSON.stringify(baseSampleData));
    });

    describe('constructor', () => {
        it('should create a valid veteran instance with provided data', () => {
            const veteran = new Veteran(sampleVeteranData);
            expect(veteran.type).to.equal('Veteran');
            expect(veteran.name.first).to.equal('John');
            expect(veteran.address.city).to.equal('Springfield');
        });

        it('should create a veteran instance with default values when no data provided', () => {
            const veteran = new Veteran();
            expect(veteran.type).to.equal('');
            expect(veteran.name.first).to.equal('');
            expect(veteran.flight.status).to.equal('Active');
        });

        it('should initialize guardian fields with default values', () => {
            const veteran = new Veteran();
            
            // Test guardian object initialization
            expect(veteran.guardian).to.be.an('object');
            expect(veteran.guardian.id).to.equal('');
            expect(veteran.guardian.name).to.equal('');
            expect(veteran.guardian.pref_notes).to.equal('');
            expect(veteran.guardian.history).to.be.an('array').that.is.empty;
        });

        it('should initialize metadata fields with default values', () => {
            const veteran = new Veteran();
            
            // Test metadata object initialization
            expect(veteran.metadata).to.be.an('object');
            expect(veteran.metadata.created_at).to.equal('');
            expect(veteran.metadata.created_by).to.equal('');
            expect(veteran.metadata.updated_at).to.equal('');
            expect(veteran.metadata.updated_by).to.equal('');
        });

        it('should initialize other default fields correctly', () => {
            const veteran = new Veteran();
            
            // Test other default fields
            expect(veteran.app_date).to.equal('');
            expect(veteran.vet_type).to.equal('WWII');
            expect(veteran.shirt).to.be.an('object');
            expect(veteran.shirt.size).to.equal('None');
        });

        it('should properly initialize fields from provided data', () => {
            const data = {
                guardian: {
                    id: 'G123',
                    name: 'Jane Doe',
                    pref_notes: 'Prefers morning flights',
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Initial assignment' }]
                },
                app_date: '2024-01-01',
                vet_type: 'Korea',
                shirt: {
                    size: 'XL'
                },
                metadata: {
                    created_at: '2024-01-01T12:00:00Z',
                    created_by: 'John Admin',
                    updated_at: '2024-01-02T12:00:00Z',
                    updated_by: 'Jane Admin'
                }
            };

            const veteran = new Veteran(data);
            
            // Test guardian initialization from data
            expect(veteran.guardian.id).to.equal('G123');
            expect(veteran.guardian.name).to.equal('Jane Doe');
            expect(veteran.guardian.pref_notes).to.equal('Prefers morning flights');
            expect(veteran.guardian.history).to.deep.equal([{ 
                id: '2024-01-01T12:00:00Z', 
                change: 'Initial assignment' 
            }]);
            
            // Test other fields initialization from data
            expect(veteran.app_date).to.equal('2024-01-01');
            expect(veteran.vet_type).to.equal('Korea');
            expect(veteran.shirt.size).to.equal('XL');
            
            // Test metadata initialization from data
            expect(veteran.metadata.created_at).to.equal('2024-01-01T12:00:00Z');
            expect(veteran.metadata.created_by).to.equal('John Admin');
            expect(veteran.metadata.updated_at).to.equal('2024-01-02T12:00:00Z');
            expect(veteran.metadata.updated_by).to.equal('Jane Admin');
        });

        it('should initialize contact fields with default values', () => {
            const veteran = new Veteran();
            
            // Test alt_contact initialization
            expect(veteran.alt_contact).to.be.an('object');
            expect(veteran.alt_contact.name).to.equal('');
            expect(veteran.alt_contact.relation).to.equal('');
            expect(veteran.alt_contact.address).to.be.an('object');
            expect(veteran.alt_contact.address.street).to.equal('');
            expect(veteran.alt_contact.address.city).to.equal('');
            expect(veteran.alt_contact.address.state).to.equal('');
            expect(veteran.alt_contact.address.zip).to.equal('');
            expect(veteran.alt_contact.address.phone).to.equal('');
            expect(veteran.alt_contact.address.phone_mbl).to.equal('');
            expect(veteran.alt_contact.address.phone_eve).to.equal('');
            expect(veteran.alt_contact.address.email).to.equal('');

            // Test emerg_contact initialization
            expect(veteran.emerg_contact).to.be.an('object');
            expect(veteran.emerg_contact.name).to.equal('');
            expect(veteran.emerg_contact.relation).to.equal('');
            expect(veteran.emerg_contact.address).to.deep.equal(veteran.alt_contact.address);
        });

        it('should initialize accommodation and mail call fields with default values', () => {
            const veteran = new Veteran();
            
            // Test accommodations initialization
            expect(veteran.accommodations).to.be.an('object');
            expect(veteran.accommodations.departure_time).to.equal('');
            expect(veteran.accommodations.arrival_date).to.equal('');
            expect(veteran.accommodations.notes).to.equal('');
            expect(veteran.accommodations.departure_date).to.equal('');
            expect(veteran.accommodations.arrival_flight).to.equal('');
            expect(veteran.accommodations.attend_banquette).to.equal('');
            expect(veteran.accommodations.departure_flight).to.equal('');
            expect(veteran.accommodations.arrival_time).to.equal('');
            expect(veteran.accommodations.banquette_guest).to.equal('');
            expect(veteran.accommodations.room_type).to.equal('None');
            expect(veteran.accommodations.hotel_name).to.equal('');

            // Test mail_call initialization
            expect(veteran.mail_call).to.be.an('object');
            expect(veteran.mail_call.received).to.equal('');
            expect(veteran.mail_call.name).to.equal('');
            expect(veteran.mail_call.notes).to.equal('');
            expect(veteran.mail_call.adopt).to.equal('');
            expect(veteran.mail_call.relation).to.equal('');
            expect(veteran.mail_call.address).to.be.an('object');
            expect(veteran.mail_call.address.phone).to.equal('');
            expect(veteran.mail_call.address.email).to.equal('');
        });

        it('should initialize call and apparel fields with default values', () => {
            const veteran = new Veteran();
            
            // Test call initialization
            expect(veteran.call).to.be.an('object');
            expect(veteran.call.fm_number).to.equal('');
            expect(veteran.call.notes).to.equal('');
            expect(veteran.call.email_sent).to.be.false;
            expect(veteran.call.assigned_to).to.equal('');
            expect(veteran.call.mail_sent).to.be.false;
            expect(veteran.call.history).to.be.an('array').that.is.empty;

            // Test media permissions initialization
            expect(veteran.media_interview_ok).to.equal('Unknown');
            expect(veteran.media_newspaper_ok).to.equal('Unknown');

            // Test homecoming initialization
            expect(veteran.homecoming).to.be.an('object');
            expect(veteran.homecoming.destination).to.equal('');

            // Test apparel initialization
            expect(veteran.apparel).to.be.an('object');
            expect(veteran.apparel.jacket_size).to.equal('None');
            expect(veteran.apparel.notes).to.equal('');
            expect(veteran.apparel.delivery).to.equal('None');
            expect(veteran.apparel.item).to.equal('None');
            expect(veteran.apparel.shirt_size).to.equal('None');
            expect(veteran.apparel.date).to.equal('');
            expect(veteran.apparel.by).to.equal('');
        });

        it('should initialize flight fields with default values', () => {
            const veteran = new Veteran();
            
            // Test flight object initialization
            expect(veteran.flight).to.be.an('object');
            expect(veteran.flight.id).to.equal('None');
            expect(veteran.flight.status).to.equal('Active');  // Default value
            expect(veteran.flight.bus).to.equal('None');
            expect(veteran.flight.seat).to.equal('');
            expect(veteran.flight.history).to.be.an('array').that.is.empty;
        });

        it('should initialize medical fields with default values', () => {
            const veteran = new Veteran();
            
            // Test medical object initialization
            expect(veteran.medical).to.be.an('object');
            expect(veteran.medical.level).to.equal('');
            expect(veteran.medical.alt_level).to.equal('');
            expect(veteran.medical.food_restriction).to.equal('None');
            expect(veteran.medical.limitations).to.equal('');
            expect(veteran.medical.review).to.equal('');
            expect(veteran.medical.usesCane).to.equal(false);
            expect(veteran.medical.usesWalker).to.equal(false);
            expect(veteran.medical.usesWheelchair).to.equal(false);
            expect(veteran.medical.usesScooter).to.equal(false);
            expect(veteran.medical.requiresOxygen).to.equal(false);
            expect(veteran.medical.examRequired).to.equal(false);
            expect(veteran.medical.isWheelchairBound).to.equal(false);
            expect(veteran.medical.form).to.equal(false);
            expect(veteran.medical.release).to.equal(false);
        });

        it('should initialize service fields with default values', () => {
            const veteran = new Veteran();
            
            // Test service object initialization
            expect(veteran.service).to.be.an('object');
            expect(veteran.service.branch).to.equal('');
            expect(veteran.service.rank).to.equal('');
            expect(veteran.service.dates).to.equal('');
            expect(veteran.service.activity).to.equal('');
        });

        it('should initialize name fields with default values', () => {
            const veteran = new Veteran();
            
            // Test name object initialization
            expect(veteran.name).to.be.an('object');
            expect(veteran.name.first).to.equal('');
            expect(veteran.name.middle).to.equal('');
            expect(veteran.name.last).to.equal('');
            expect(veteran.name.nickname).to.equal('');
        });

        it('should initialize address fields with default values', () => {
            const veteran = new Veteran();
            
            // Test address object initialization
            expect(veteran.address).to.be.an('object');
            expect(veteran.address.street).to.equal('');
            expect(veteran.address.city).to.equal('');
            expect(veteran.address.state).to.equal('');
            expect(veteran.address.zip).to.equal('');
            expect(veteran.address.county).to.equal('');
            expect(veteran.address.phone_day).to.equal('');
            expect(veteran.address.phone_eve).to.equal('');
            expect(veteran.address.phone_mbl).to.equal('');
            expect(veteran.address.email).to.equal('');
        });

        it('should handle missing alt_contact properties', () => {
            const veteran = new Veteran({
                alt_contact: null
            });
            
            // Verify alt_contact is initialized with defaults when null
            expect(veteran.alt_contact).to.be.an('object');
            expect(veteran.alt_contact.name).to.equal('');
            expect(veteran.alt_contact.relation).to.equal('');
            expect(veteran.alt_contact.address).to.be.an('object');
        });

        it('should handle missing alt_contact.address properties', () => {
            const veteran = new Veteran({
                alt_contact: {
                    name: 'John Doe',
                    relation: 'Son',
                    address: null
                }
            });
            
            // Verify address is initialized with defaults when null
            expect(veteran.alt_contact.address).to.be.an('object');
            expect(veteran.alt_contact.address.street).to.equal('');
            expect(veteran.alt_contact.address.city).to.equal('');
            expect(veteran.alt_contact.address.state).to.equal('');
            expect(veteran.alt_contact.address.zip).to.equal('');
            expect(veteran.alt_contact.address.phone).to.equal('');
            expect(veteran.alt_contact.address.phone_mbl).to.equal('');
            expect(veteran.alt_contact.address.phone_eve).to.equal('');
            expect(veteran.alt_contact.address.email).to.equal('');
        });

        it('should handle partially defined alt_contact.address properties', () => {
            const veteran = new Veteran({
                alt_contact: {
                    name: 'John Doe',
                    address: {
                        street: '123 Main St',
                        // other address fields missing
                    }
                }
            });
            
            // Verify missing address fields get defaults
            expect(veteran.alt_contact.address.street).to.equal('123 Main St');
            expect(veteran.alt_contact.address.city).to.equal('');
            expect(veteran.alt_contact.address.state).to.equal('');
            expect(veteran.alt_contact.address.zip).to.equal('');
            expect(veteran.alt_contact.address.phone).to.equal('');
            expect(veteran.alt_contact.address.phone_mbl).to.equal('');
            expect(veteran.alt_contact.address.phone_eve).to.equal('');
            expect(veteran.alt_contact.address.email).to.equal('');
        });

        it('should handle undefined alt_contact properties', () => {
            const veteran = new Veteran({
                alt_contact: {
                    name: undefined,
                    relation: undefined,
                    address: {
                        street: undefined,
                        city: undefined,
                        state: undefined,
                        zip: undefined,
                        phone: undefined,
                        phone_mbl: undefined,
                        phone_eve: undefined,
                        email: undefined
                    }
                }
            });
            
            // Verify undefined values are replaced with defaults
            expect(veteran.alt_contact.name).to.equal('');
            expect(veteran.alt_contact.relation).to.equal('');
            expect(veteran.alt_contact.address.street).to.equal('');
            expect(veteran.alt_contact.address.city).to.equal('');
            expect(veteran.alt_contact.address.state).to.equal('');
            expect(veteran.alt_contact.address.zip).to.equal('');
            expect(veteran.alt_contact.address.phone).to.equal('');
            expect(veteran.alt_contact.address.phone_mbl).to.equal('');
            expect(veteran.alt_contact.address.phone_eve).to.equal('');
            expect(veteran.alt_contact.address.email).to.equal('');
        });

        it('should handle missing emerg_contact properties', () => {
            const veteran = new Veteran({
                emerg_contact: null
            });
            
            // Verify emerg_contact is initialized with defaults when null
            expect(veteran.emerg_contact).to.be.an('object');
            expect(veteran.emerg_contact.name).to.equal('');
            expect(veteran.emerg_contact.relation).to.equal('');
            expect(veteran.emerg_contact.address).to.be.an('object');
        });

        it('should handle missing emerg_contact.address properties', () => {
            const veteran = new Veteran({
                emerg_contact: {
                    name: 'Jane Doe',
                    relation: 'Daughter',
                    address: null
                }
            });
            
            // Verify address is initialized with defaults when null
            expect(veteran.emerg_contact.address).to.be.an('object');
            expect(veteran.emerg_contact.address.street).to.equal('');
            expect(veteran.emerg_contact.address.city).to.equal('');
            expect(veteran.emerg_contact.address.state).to.equal('');
            expect(veteran.emerg_contact.address.zip).to.equal('');
            expect(veteran.emerg_contact.address.phone).to.equal('');
            expect(veteran.emerg_contact.address.phone_mbl).to.equal('');
            expect(veteran.emerg_contact.address.phone_eve).to.equal('');
            expect(veteran.emerg_contact.address.email).to.equal('');
        });

        it('should handle partially defined emerg_contact.address properties', () => {
            const veteran = new Veteran({
                emerg_contact: {
                    name: 'Jane Doe',
                    address: {
                        street: '456 Oak St',
                        phone: '555-123-4567'
                        // other address fields missing
                    }
                }
            });
            
            // Verify missing address fields get defaults while keeping defined values
            expect(veteran.emerg_contact.address.street).to.equal('456 Oak St');
            expect(veteran.emerg_contact.address.phone).to.equal('555-123-4567');
            expect(veteran.emerg_contact.address.city).to.equal('');
            expect(veteran.emerg_contact.address.state).to.equal('');
            expect(veteran.emerg_contact.address.zip).to.equal('');
            expect(veteran.emerg_contact.address.phone_mbl).to.equal('');
            expect(veteran.emerg_contact.address.phone_eve).to.equal('');
            expect(veteran.emerg_contact.address.email).to.equal('');
        });

        it('should handle undefined emerg_contact properties', () => {
            const veteran = new Veteran({
                emerg_contact: {
                    name: undefined,
                    relation: undefined,
                    address: {
                        street: undefined,
                        city: undefined,
                        state: undefined,
                        zip: undefined,
                        phone: undefined,
                        phone_mbl: undefined,
                        phone_eve: undefined,
                        email: undefined
                    }
                }
            });
            
            // Verify undefined values are replaced with defaults
            expect(veteran.emerg_contact.name).to.equal('');
            expect(veteran.emerg_contact.relation).to.equal('');
            expect(veteran.emerg_contact.address.street).to.equal('');
            expect(veteran.emerg_contact.address.city).to.equal('');
            expect(veteran.emerg_contact.address.state).to.equal('');
            expect(veteran.emerg_contact.address.zip).to.equal('');
            expect(veteran.emerg_contact.address.phone).to.equal('');
            expect(veteran.emerg_contact.address.phone_mbl).to.equal('');
            expect(veteran.emerg_contact.address.phone_eve).to.equal('');
            expect(veteran.emerg_contact.address.email).to.equal('');
        });

        it('should handle missing accommodations properties', () => {
            const veteran = new Veteran({
                accommodations: null
            });
            
            // Verify accommodations is initialized with defaults when null
            expect(veteran.accommodations).to.be.an('object');
            expect(veteran.accommodations.departure_time).to.equal('');
            expect(veteran.accommodations.arrival_date).to.equal('');
            expect(veteran.accommodations.notes).to.equal('');
            expect(veteran.accommodations.departure_date).to.equal('');
            expect(veteran.accommodations.arrival_flight).to.equal('');
            expect(veteran.accommodations.attend_banquette).to.equal('');
            expect(veteran.accommodations.departure_flight).to.equal('');
            expect(veteran.accommodations.arrival_time).to.equal('');
            expect(veteran.accommodations.banquette_guest).to.equal('');
            expect(veteran.accommodations.room_type).to.equal('None');
            expect(veteran.accommodations.hotel_name).to.equal('');
        });

        it('should handle partially defined accommodations properties', () => {
            const veteran = new Veteran({
                accommodations: {
                    arrival_date: '2024-05-01',
                    arrival_time: '10:00',
                    room_type: 'Double'
                    // other fields missing
                }
            });
            
            // Verify defined values are kept and missing ones get defaults
            expect(veteran.accommodations.arrival_date).to.equal('2024-05-01');
            expect(veteran.accommodations.arrival_time).to.equal('10:00');
            expect(veteran.accommodations.room_type).to.equal('Double');
            expect(veteran.accommodations.departure_time).to.equal('');
            expect(veteran.accommodations.notes).to.equal('');
            expect(veteran.accommodations.departure_date).to.equal('');
            expect(veteran.accommodations.arrival_flight).to.equal('');
            expect(veteran.accommodations.attend_banquette).to.equal('');
            expect(veteran.accommodations.departure_flight).to.equal('');
            expect(veteran.accommodations.banquette_guest).to.equal('');
            expect(veteran.accommodations.hotel_name).to.equal('');
        });

        it('should handle undefined accommodations properties', () => {
            const veteran = new Veteran({
                accommodations: {
                    departure_time: undefined,
                    arrival_date: undefined,
                    notes: undefined,
                    departure_date: undefined,
                    arrival_flight: undefined,
                    attend_banquette: undefined,
                    departure_flight: undefined,
                    arrival_time: undefined,
                    banquette_guest: undefined,
                    room_type: undefined,
                    hotel_name: undefined
                }
            });
            
            // Verify undefined values are replaced with defaults
            expect(veteran.accommodations.departure_time).to.equal('');
            expect(veteran.accommodations.arrival_date).to.equal('');
            expect(veteran.accommodations.notes).to.equal('');
            expect(veteran.accommodations.departure_date).to.equal('');
            expect(veteran.accommodations.arrival_flight).to.equal('');
            expect(veteran.accommodations.attend_banquette).to.equal('');
            expect(veteran.accommodations.departure_flight).to.equal('');
            expect(veteran.accommodations.arrival_time).to.equal('');
            expect(veteran.accommodations.banquette_guest).to.equal('');
            expect(veteran.accommodations.room_type).to.equal('None');
            expect(veteran.accommodations.hotel_name).to.equal('');
        });

        it('should handle missing mail_call properties', () => {
            const veteran = new Veteran({
                mail_call: null
            });
            
            // Verify mail_call is initialized with defaults when null
            expect(veteran.mail_call).to.be.an('object');
            expect(veteran.mail_call.received).to.equal('');
            expect(veteran.mail_call.name).to.equal('');
            expect(veteran.mail_call.notes).to.equal('');
            expect(veteran.mail_call.adopt).to.equal('');
            expect(veteran.mail_call.relation).to.equal('');
            expect(veteran.mail_call.address).to.be.an('object');
            expect(veteran.mail_call.address.phone).to.equal('');
            expect(veteran.mail_call.address.email).to.equal('');
        });

        it('should handle missing mail_call.address properties', () => {
            const veteran = new Veteran({
                mail_call: {
                    name: 'John Smith',
                    notes: 'Test notes',
                    address: null
                }
            });
            
            // Verify address is initialized with defaults when null
            expect(veteran.mail_call.name).to.equal('John Smith');
            expect(veteran.mail_call.notes).to.equal('Test notes');
            expect(veteran.mail_call.address).to.be.an('object');
            expect(veteran.mail_call.address.phone).to.equal('');
            expect(veteran.mail_call.address.email).to.equal('');
        });

        it('should handle partially defined mail_call properties', () => {
            const veteran = new Veteran({
                mail_call: {
                    name: 'John Smith',
                    notes: 'Test notes',
                    // other fields missing
                    address: {
                        phone: '555-123-4567'
                        // email missing
                    }
                }
            });
            
            // Verify defined values are kept and missing ones get defaults
            expect(veteran.mail_call.name).to.equal('John Smith');
            expect(veteran.mail_call.notes).to.equal('Test notes');
            expect(veteran.mail_call.received).to.equal('');
            expect(veteran.mail_call.adopt).to.equal('');
            expect(veteran.mail_call.relation).to.equal('');
            expect(veteran.mail_call.address.phone).to.equal('555-123-4567');
            expect(veteran.mail_call.address.email).to.equal('');
        });

        it('should handle undefined mail_call properties', () => {
            const veteran = new Veteran({
                mail_call: {
                    received: undefined,
                    name: undefined,
                    notes: undefined,
                    adopt: undefined,
                    relation: undefined,
                    address: {
                        phone: undefined,
                        email: undefined
                    }
                }
            });
            
            // Verify undefined values are replaced with defaults
            expect(veteran.mail_call.received).to.equal('');
            expect(veteran.mail_call.name).to.equal('');
            expect(veteran.mail_call.notes).to.equal('');
            expect(veteran.mail_call.adopt).to.equal('');
            expect(veteran.mail_call.relation).to.equal('');
            expect(veteran.mail_call.address.phone).to.equal('');
            expect(veteran.mail_call.address.email).to.equal('');
        });

        it('should handle missing call properties', () => {
            const veteran = new Veteran({
                call: null
            });
            
            // Verify call is initialized with defaults when null
            expect(veteran.call).to.be.an('object');
            expect(veteran.call.fm_number).to.equal('');
            expect(veteran.call.notes).to.equal('');
            expect(veteran.call.email_sent).to.be.false;
            expect(veteran.call.assigned_to).to.equal('');
            expect(veteran.call.mail_sent).to.be.false;
            expect(veteran.call.history).to.be.an('array').that.is.empty;
        });

        it('should handle partially defined call properties', () => {
            const veteran = new Veteran({
                call: {
                    fm_number: 'FM123',
                    notes: 'Test notes'
                    // other fields missing
                }
            });
            
            // Verify defined values are kept and missing ones get defaults
            expect(veteran.call.fm_number).to.equal('FM123');
            expect(veteran.call.notes).to.equal('Test notes');
            expect(veteran.call.email_sent).to.be.false;
            expect(veteran.call.assigned_to).to.equal('');
            expect(veteran.call.mail_sent).to.be.false;
            expect(veteran.call.history).to.be.an('array').that.is.empty;
        });

        it('should handle undefined call properties', () => {
            const veteran = new Veteran({
                call: {
                    fm_number: undefined,
                    notes: undefined,
                    email_sent: undefined,
                    assigned_to: undefined,
                    mail_sent: undefined,
                    history: undefined
                }
            });
            
            // Verify undefined values are replaced with defaults
            expect(veteran.call.fm_number).to.equal('');
            expect(veteran.call.notes).to.equal('');
            expect(veteran.call.email_sent).to.be.false;
            expect(veteran.call.assigned_to).to.equal('');
            expect(veteran.call.mail_sent).to.be.false;
            expect(veteran.call.history).to.be.an('array').that.is.empty;
        });

        it('should handle boolean call properties correctly', () => {
            const veteran = new Veteran({
                call: {
                    email_sent: true,
                    mail_sent: true,
                    // other fields with default values
                }
            });
            
            // Verify boolean values are preserved and others get defaults
            expect(veteran.call.email_sent).to.be.true;
            expect(veteran.call.mail_sent).to.be.true;
            expect(veteran.call.fm_number).to.equal('');
            expect(veteran.call.notes).to.equal('');
            expect(veteran.call.assigned_to).to.equal('');
            expect(veteran.call.history).to.be.an('array').that.is.empty;
        });

        it('should handle missing homecoming properties', () => {
            const veteran = new Veteran({
                homecoming: null
            });
            
            // Verify homecoming is initialized with defaults when null
            expect(veteran.homecoming).to.be.an('object');
            expect(veteran.homecoming.destination).to.equal('');
        });

        it('should handle partially defined homecoming properties', () => {
            const veteran = new Veteran({
                homecoming: {
                    // destination missing
                }
            });
            
            // Verify missing destination gets default
            expect(veteran.homecoming.destination).to.equal('');
        });

        it('should handle undefined homecoming properties', () => {
            const veteran = new Veteran({
                homecoming: {
                    destination: undefined
                }
            });
            
            // Verify undefined destination is replaced with default
            expect(veteran.homecoming.destination).to.equal('');
        });

        it('should handle defined homecoming destination', () => {
            const veteran = new Veteran({
                homecoming: {
                    destination: 'Chicago'
                }
            });
            
            // Verify destination value is preserved
            expect(veteran.homecoming.destination).to.equal('Chicago');
        });

        it('should handle missing apparel properties', () => {
            const veteran = new Veteran({
                apparel: null
            });
            
            // Verify apparel is initialized with defaults when null
            expect(veteran.apparel).to.be.an('object');
            expect(veteran.apparel.jacket_size).to.equal('None');
            expect(veteran.apparel.notes).to.equal('');
            expect(veteran.apparel.delivery).to.equal('None');
            expect(veteran.apparel.item).to.equal('None');
            expect(veteran.apparel.shirt_size).to.equal('None');
            expect(veteran.apparel.date).to.equal('');
            expect(veteran.apparel.by).to.equal('');
        });

        it('should handle partially defined apparel properties', () => {
            const veteran = new Veteran({
                apparel: {
                    jacket_size: 'XL',
                    notes: 'Test notes'
                    // other fields missing
                }
            });
            
            // Verify defined values are kept and missing ones get defaults
            expect(veteran.apparel.jacket_size).to.equal('XL');
            expect(veteran.apparel.notes).to.equal('Test notes');
            expect(veteran.apparel.delivery).to.equal('None');
            expect(veteran.apparel.item).to.equal('None');
            expect(veteran.apparel.shirt_size).to.equal('None');
            expect(veteran.apparel.date).to.equal('');
            expect(veteran.apparel.by).to.equal('');
        });

        it('should handle undefined apparel properties', () => {
            const veteran = new Veteran({
                apparel: {
                    jacket_size: undefined,
                    notes: undefined,
                    delivery: undefined,
                    item: undefined,
                    shirt_size: undefined,
                    date: undefined,
                    by: undefined
                }
            });
            
            // Verify undefined values are replaced with defaults
            expect(veteran.apparel.jacket_size).to.equal('None');
            expect(veteran.apparel.notes).to.equal('');
            expect(veteran.apparel.delivery).to.equal('None');
            expect(veteran.apparel.item).to.equal('None');
            expect(veteran.apparel.shirt_size).to.equal('None');
            expect(veteran.apparel.date).to.equal('');
            expect(veteran.apparel.by).to.equal('');
        });

        it('should handle mixed default values in apparel properties', () => {
            const veteran = new Veteran({
                apparel: {
                    jacket_size: 'L',  // Custom value
                    notes: '',         // Empty string (same as default)
                    delivery: 'None',  // Same as default
                    item: undefined,   // Undefined
                    shirt_size: null,  // Null
                    date: '2024-01-01', // Custom value
                    by: ''            // Empty string (same as default)
                }
            });
            
            // Verify correct handling of different types of values
            expect(veteran.apparel.jacket_size).to.equal('L');
            expect(veteran.apparel.notes).to.equal('');
            expect(veteran.apparel.delivery).to.equal('None');
            expect(veteran.apparel.item).to.equal('None');
            expect(veteran.apparel.shirt_size).to.equal('None');
            expect(veteran.apparel.date).to.equal('2024-01-01');
            expect(veteran.apparel.by).to.equal('');
        });
    });

    describe('validate', () => {
        it('should validate a correct veteran record', () => {
            const veteran = new Veteran(sampleVeteranData);
            expect(veteran.validate()).to.be.true;
        });

        it('should reject invalid first name', () => {
            sampleVeteranData.name.first = '12';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Validation failed');
        });

        it('should reject invalid phone format', () => {
            sampleVeteranData.address.phone_day = '1234';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Day phone is required');
        });

        it('should reject invalid medical level', () => {
            sampleVeteranData.medical.level = '5';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Medical level must be');
        });

        it('should reject invalid flight status', () => {
            sampleVeteranData.flight.status = 'Invalid';
            const veteran = new Veteran(sampleVeteranData);
            expect(() => veteran.validate()).to.throw('Invalid flight status');
        });

        it('should validate all address fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid email
            veteran.address.email = 'invalid-email';
            expect(() => veteran.validate()).to.throw('Email must be a valid email address');
            
            // Test invalid phone formats
            veteran.address.email = 'valid@email.com';
            veteran.address.phone_eve = 'invalid';
            expect(() => veteran.validate()).to.throw('Evening phone must contain only numbers');
            
            veteran.address.phone_eve = '217-555-5678';
            veteran.address.phone_mbl = 'invalid';
            expect(() => veteran.validate()).to.throw('Mobile phone must contain only numbers');
        });

        it('should validate emergency and alternate contact fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test emergency contact validation
            veteran.emerg_contact = {
                name: '12', // Invalid name
                phone: '555'  // Invalid phone
            };
            expect(() => veteran.validate()).to.throw('Emergency contact name must contain only letters');
            
            // Test alternate contact validation
            veteran.alt_contact = {
                name: '12', // Invalid name
                phone: '555'  // Invalid phone
            };
            expect(() => veteran.validate()).to.throw('Alternate contact name must contain only letters');
        });

        it('should validate mail call fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            veteran.mail_call = {
                name: '12', // Invalid name
                address: {
                    phone: '555', // Invalid phone
                    email: 'invalid-email'
                }
            };
            expect(() => veteran.validate()).to.throw('Mail call name must contain only letters');
        });

        it('should validate media permissions', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            veteran.media_interview_ok = 'Invalid';
            expect(() => veteran.validate()).to.throw('Media interview permission must be Yes, No, or Unknown');
            
            veteran.media_interview_ok = 'Yes';
            veteran.media_newspaper_ok = 'Invalid';
            expect(() => veteran.validate()).to.throw('Media newspaper permission must be Yes, No, or Unknown');
        });

        it('should validate apparel fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            veteran.apparel.jacket_size = 'Invalid';
            expect(() => veteran.validate()).to.throw('Invalid jacket size');
            
            veteran.apparel.jacket_size = 'XL';
            veteran.apparel.shirt_size = 'Invalid';
            expect(() => veteran.validate()).to.throw('Invalid shirt size');
            
            veteran.apparel.shirt_size = 'L';
            veteran.apparel.delivery = 'Invalid';
            expect(() => veteran.validate()).to.throw('Invalid delivery method');
        });

        it('should validate birth date format', () => {
            const veteran = new Veteran(sampleVeteranData);
            veteran.birth_date = '2024/01/01'; // Invalid format
            expect(() => veteran.validate()).to.throw('Birth date must be in YYYY-MM-DD format');
        });

        it('should validate service branch', () => {
            const veteran = new Veteran(sampleVeteranData);
            veteran.service.branch = 'Space Force'; // Invalid branch
            expect(() => veteran.validate()).to.throw('Invalid service branch');
        });

        it('should validate veteran type', () => {
            const veteran = new Veteran(sampleVeteranData);
            veteran.vet_type = 'Modern'; // Invalid type
            expect(() => veteran.validate()).to.throw('Invalid veteran type');
        });

        it('should validate accommodation fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            veteran.accommodations.room_type = 'Invalid';
            expect(() => veteran.validate()).to.throw('Invalid room type');

        });

        it('should validate emergency contact fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid emergency contact phone (line 188)
            veteran.emerg_contact.phone = '555';  // Too short
            expect(() => veteran.validate()).to.throw('Emergency contact phone must contain at least 12 digits/characters');
            
            // Test invalid alternate contact phone (line 191)
            veteran.emerg_contact.phone = '123-456-7890';
            veteran.alt_contact.phone = '555'; // Too short
            expect(() => veteran.validate()).to.throw('Alternate contact phone must contain at least 12 digits/characters');
            
            // Test invalid mail call phone (line 194)
            veteran.alt_contact.phone = '123-456-7890';
            veteran.mail_call.address.phone = '555'; // Too short
            expect(() => veteran.validate()).to.throw('Mail call phone must contain at least 12 digits/characters');
            
            // Test invalid mail call email (line 197)
            veteran.mail_call.address.phone = '123-456-7890';
            veteran.mail_call.address.email = 'invalid-email';
            expect(() => veteran.validate()).to.throw('Mail call email must be a valid email address');
        });

        it('should validate media and apparel fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid media interview permission (line 214)
            veteran.media_interview_ok = 'Maybe';
            expect(() => veteran.validate()).to.throw('Media interview permission must be Yes, No, or Unknown');
            
            // Test invalid media newspaper permission (line 219)
            veteran.media_interview_ok = 'Yes';
            veteran.media_newspaper_ok = 'Maybe';
            expect(() => veteran.validate()).to.throw('Media newspaper permission must be Yes, No, or Unknown');
            
            // Test invalid jacket size (line 224)
            veteran.media_newspaper_ok = 'Yes';
            veteran.apparel.jacket_size = 'XXL';
            expect(() => veteran.validate()).to.throw('Invalid jacket size');
        });

        it('should validate medical and service fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid gender (line 284)
            veteran.gender = 'X';
            expect(() => veteran.validate()).to.throw('Gender must be M or F');
            
            // Test invalid service branch (line 295)
            veteran.gender = 'M';
            veteran.service.branch = 'Space Force';
            expect(() => veteran.validate()).to.throw('Invalid service branch');
        });

        it('should validate medical levels', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid primary medical level
            veteran.medical.level = '5';
            expect(() => veteran.validate()).to.throw('Medical level must be 1, 2, 3, 3.5, or 4');
            
            veteran.medical.level = 'invalid';
            expect(() => veteran.validate()).to.throw('Medical level must be 1, 2, 3, 3.5, or 4');
            
            // Test invalid alternate medical level
            veteran.medical.level = '5';
            expect(() => veteran.validate()).to.throw('Medical level must be 1, 2, 3, 3.5, or 4');
            
            veteran.medical.level = 'invalid';
            expect(() => veteran.validate()).to.throw('Medical level must be 1, 2, 3, 3.5, or 4');
            
            // Test valid medical levels
            const validLevels = ['1', '2', '3', '3.5', '4'];
            
            // Test all valid combinations
            validLevels.forEach(primaryLevel => {
                veteran.medical.level = primaryLevel;
                veteran.medical.alt_level = primaryLevel;
                expect(() => veteran.validate()).to.not.throw();
            });
        });

        it('should validate flight and accommodation fields', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid flight status (line 310)
            veteran.flight.status = 'Pending';
            expect(() => veteran.validate()).to.throw('Invalid flight status');
            
            // Test invalid flight bus (line 320)
            veteran.flight.status = 'Active';
            veteran.flight.bus = 'Charlie1';
            expect(() => veteran.validate()).to.throw('Invalid bus assignment');
            
            // Test invalid room type (line 325)
            veteran.flight.bus = 'Alpha1';
            veteran.accommodations.room_type = 'Triple';
            expect(() => veteran.validate()).to.throw('Invalid room type');
        });

        it('should validate nickname format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid nickname with numbers
            veteran.name.nickname = 'Johnny123';
            expect(() => veteran.validate()).to.throw('Nickname must contain only letters, periods, apostrophes and spaces');
            
            // Test invalid nickname with special characters
            veteran.name.nickname = 'Johnny$';
            expect(() => veteran.validate()).to.throw('Nickname must contain only letters, periods, apostrophes and spaces');
            
            // Test valid nickname formats
            veteran.name.nickname = 'Johnny';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.nickname = "J.J.";  // With periods
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.nickname = "O'Brien";  // With apostrophe
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.nickname = "Jim Bob";  // With space
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate call history entries', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid timestamp format
            veteran.call.history = [{
                id: '2024/01/01 12:00:00',  // Wrong format
                change: 'Test change'
            }];
            expect(() => veteran.validate()).to.throw('Call history entry 1 has invalid timestamp format');
            
            // Test missing change description
            veteran.call.history = [{
                id: '2024-01-01T12:00:00Z',
                change: null  // Invalid - not a string
            }];
            expect(() => veteran.validate()).to.throw('Call history entry 1 must have a change description');
            
            // Test missing change field
            veteran.call.history = [{
                id: '2024-01-01T12:00:00Z'
                // change field missing
            }];
            expect(() => veteran.validate()).to.throw('Call history entry 1 must have a change description');
            
            // Test valid history entry
            veteran.call.history = [{
                id: '2024-01-01T12:00:00Z',
                change: 'Valid change description'
            }];
            expect(() => veteran.validate()).to.not.throw();
            
            // Test multiple entries
            veteran.call.history = [
                {
                    id: '2024-01-01T12:00:00Z',
                    change: 'First change'
                },
                {
                    id: 'invalid-date',  // Invalid format
                    change: 'Second change'
                }
            ];
            expect(() => veteran.validate()).to.throw('Call history entry 2 has invalid timestamp format');
        });

        it('should validate alternate medical level', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid alternate medical level
            veteran.medical.alt_level = '5';
            expect(() => veteran.validate()).to.throw('Medical level must be 1, 2, 3, 3.5, or 4');
            
            veteran.medical.alt_level = 'invalid';
            expect(() => veteran.validate()).to.throw('Medical level must be 1, 2, 3, 3.5, or 4');
            
            // Test valid alternate medical levels
            veteran.medical.alt_level = '1';
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.medical.alt_level = '2';
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.medical.alt_level = '3';
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.medical.alt_level = '3.5';
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.medical.alt_level = '4';
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate apparel item', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid apparel items
            veteran.apparel.item = 'Shirt';
            expect(() => veteran.validate()).to.throw('Invalid apparel item');
            
            veteran.apparel.item = 'Invalid';
            expect(() => veteran.validate()).to.throw('Invalid apparel item');
            
            // Test valid apparel items
            const validItems = ['None', 'Jacket', 'Polo', 'Both'];
            validItems.forEach(item => {
                veteran.apparel.item = item;
                expect(() => veteran.validate()).to.not.throw();
            });
        });

        it('should validate last name format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test missing last name
            veteran.name.last = '';
            expect(() => veteran.validate()).to.throw('Last name is required and must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            // Test last name too short
            veteran.name.last = 'A';
            expect(() => veteran.validate()).to.throw('Last name is required and must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            // Test invalid characters
            veteran.name.last = 'Smith123';
            expect(() => veteran.validate()).to.throw('Last name is required and must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            // Test valid last names
            veteran.name.last = 'Smith';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.last = "O'Brien";  // With apostrophe
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.last = "St. Claire";  // With period and space
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.last = "Smith-Jones";  // With hyphen
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate middle name format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid middle names
            veteran.name.middle = 'Robert123';  // With numbers
            expect(() => veteran.validate()).to.throw('Middle name must contain only letters, apostrophes and spaces');
            
            veteran.name.middle = 'Robert.';  // With period
            expect(() => veteran.validate()).to.throw('Middle name must contain only letters, apostrophes and spaces');
            
            veteran.name.middle = 'Robert$';  // With special character
            expect(() => veteran.validate()).to.throw('Middle name must contain only letters, apostrophes and spaces');
            
            // Test valid middle names
            veteran.name.middle = 'Robert';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.middle = "O'Brien";  // With apostrophe
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.middle = 'James Robert';  // With space
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.name.middle = '';  // Empty string (optional field)
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate street address format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test missing street address
            veteran.address.street = '';
            expect(() => veteran.validate()).to.throw('Street address is required and must contain only letters, numbers, and basic punctuation (min 2 chars)');
            
            // Test street address too short
            veteran.address.street = 'A';
            expect(() => veteran.validate()).to.throw('Street address is required and must contain only letters, numbers, and basic punctuation (min 2 chars)');
            
            // Test invalid characters
            veteran.address.street = '123 Main St @#$';
            expect(() => veteran.validate()).to.throw('Street address is required and must contain only letters, numbers, and basic punctuation (min 2 chars)');
            
            // Test valid street addresses
            veteran.address.street = '123 Main St';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.street = '456 W. Oak Street';  // With period
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.street = '789 Martin Luther King Jr. Blvd';  // Complex with period
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.street = '321 1st/2nd Floor';  // With forward slash
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.street = '567 Apt. #2B';  // With hash
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.street = '890 North-South Ave';  // With hyphen
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate city format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test missing city
            veteran.address.city = '';
            expect(() => veteran.validate()).to.throw('City is required and must contain only letters, periods, hyphens and spaces (min 2 chars)');
            
            // Test city too short
            veteran.address.city = 'A';
            expect(() => veteran.validate()).to.throw('City is required and must contain only letters, periods, hyphens and spaces (min 2 chars)');
            
            // Test invalid characters
            veteran.address.city = 'Chicago123';  // With numbers
            expect(() => veteran.validate()).to.throw('City is required and must contain only letters, periods, hyphens and spaces (min 2 chars)');
            
            veteran.address.city = 'Chicago@';  // With special characters
            expect(() => veteran.validate()).to.throw('City is required and must contain only letters, periods, hyphens and spaces (min 2 chars)');
            
            // Test valid city names
            veteran.address.city = 'Chicago';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.city = 'St. Louis';  // With period and space
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.city = 'Winston-Salem';  // With hyphen
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.city = 'Ft. Worth';  // With abbreviation
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate county format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test missing county
            veteran.address.county = '';
            expect(() => veteran.validate()).to.throw('County is required and must contain only letters, periods and spaces (min 2 chars)');
            
            // Test county too short
            veteran.address.county = 'A';
            expect(() => veteran.validate()).to.throw('County is required and must contain only letters, periods and spaces (min 2 chars)');
            
            // Test invalid characters
            veteran.address.county = 'Cook123';  // With numbers
            expect(() => veteran.validate()).to.throw('County is required and must contain only letters, periods and spaces (min 2 chars)');
            
            veteran.address.county = 'Cook-Lake';  // With hyphen
            expect(() => veteran.validate()).to.throw('County is required and must contain only letters, periods and spaces (min 2 chars)');
            
            // Test valid county names
            veteran.address.county = 'Cook';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.county = 'St. Clair';  // With period and space
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.county = 'Du Page';  // With space
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate state format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test missing state
            veteran.address.state = '';
            expect(() => veteran.validate()).to.throw('State is required and must be exactly 2 letters');
            
            // Test state too short
            veteran.address.state = 'I';
            expect(() => veteran.validate()).to.throw('State is required and must be exactly 2 letters');
            
            // Test state too long
            veteran.address.state = 'ILL';
            expect(() => veteran.validate()).to.throw('State is required and must be exactly 2 letters');
            
            // Test invalid characters
            veteran.address.state = 'I1';  // With number
            expect(() => veteran.validate()).to.throw('State is required and must be exactly 2 letters');
            
            veteran.address.state = 'I.';  // With period
            expect(() => veteran.validate()).to.throw('State is required and must be exactly 2 letters');
            
            // Test valid state codes
            veteran.address.state = 'IL';  // Illinois
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.state = 'CA';  // California
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.state = 'NY';  // New York
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate ZIP code format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test missing ZIP code
            veteran.address.zip = '';
            expect(() => veteran.validate()).to.throw('ZIP code is required and must contain at least 5 digits');
            
            // Test ZIP code too short
            veteran.address.zip = '1234';
            expect(() => veteran.validate()).to.throw('ZIP code is required and must contain at least 5 digits');
            
            // Test invalid characters
            veteran.address.zip = '123ab';
            expect(() => veteran.validate()).to.throw('ZIP code is required and must contain at least 5 digits');
            
            veteran.address.zip = '12345@';
            expect(() => veteran.validate()).to.throw('ZIP code is required and must contain at least 5 digits');
            
            // Test valid ZIP codes
            veteran.address.zip = '12345';  // Simple 5-digit
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.zip = '12345-6789';  // With hyphen
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.address.zip = '12345 6789';  // With space
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate service rank format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid characters
            veteran.service.rank = 'Sergeant@';  // With invalid special character
            expect(() => veteran.validate()).to.throw('Rank must contain only letters, numbers, and basic punctuation');
            
            veteran.service.rank = 'Sergeant$First%Class';  // With multiple invalid characters
            expect(() => veteran.validate()).to.throw('Rank must contain only letters, numbers, and basic punctuation');
            
            // Test valid rank formats
            veteran.service.rank = 'Sergeant';  // Simple
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.service.rank = 'Sergeant First Class';  // With spaces
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.service.rank = 'E-5';  // With hyphen and number
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.service.rank = 'Sgt. 1st Class';  // With period, space, and number
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.service.rank = 'CPT/MAJ';  // With forward slash
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.service.rank = 'Lt. Col.';  // With multiple periods
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.service.rank = '';  // Empty string (optional field)
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate document type', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid document types
            veteran.type = '';  // Empty string
            expect(() => veteran.validate()).to.throw('Document type must be Veteran');
            
            veteran.type = 'Guardian';  // Wrong type
            expect(() => veteran.validate()).to.throw('Document type must be Veteran');
            
            veteran.type = 'veteran';  // Wrong case
            expect(() => veteran.validate()).to.throw('Document type must be Veteran');
            
            // Test valid document type
            veteran.type = 'Veteran';
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate weight format', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid weight formats
            veteran.weight = '45';  // Too low
            expect(() => veteran.validate()).to.throw('Weight must be a number between 60-450');
            
            veteran.weight = '500';  // Too high
            expect(() => veteran.validate()).to.throw('Weight must be a number between 60-450');
            
            veteran.weight = '12a';  // Non-numeric
            expect(() => veteran.validate()).to.throw('Weight must be a number between 60-450');
            
            veteran.weight = '1234';  // Too many digits
            expect(() => veteran.validate()).to.throw('Weight must be a number between 60-450');
            
            veteran.weight = '100.5';  // Decimal not allowed
            expect(() => veteran.validate()).to.throw('Weight must be a number between 60-450');
            
            // Test valid weights
            veteran.weight = '60';  // Minimum
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.weight = '180';  // Normal
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.weight = '450';  // Maximum
            expect(() => veteran.validate()).to.not.throw();
            
            veteran.weight = '';  // Empty string (optional field)
            expect(() => veteran.validate()).to.not.throw();
        });

        it('should validate food restriction', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            // Test invalid food restrictions
            veteran.medical.food_restriction = 'Halal';
            expect(() => veteran.validate()).to.throw('Invalid food restriction');
            
            veteran.medical.food_restriction = 'Kosher';
            expect(() => veteran.validate()).to.throw('Invalid food restriction');
            
            veteran.medical.food_restriction = 'Invalid';
            expect(() => veteran.validate()).to.throw('Invalid food restriction');
            
            // Test valid food restrictions
            const validRestrictions = ['None', 'Gluten Free', 'Vegetarian', 'Vegan'];
            validRestrictions.forEach(restriction => {
                veteran.medical.food_restriction = restriction;
                expect(() => veteran.validate()).to.not.throw();
            });
            
            // Test empty string (optional field)
            veteran.medical.food_restriction = '';
            expect(() => veteran.validate()).to.not.throw();
        });
    });

    describe('prepareForSave', () => {
        it('should update metadata with user information', () => {
            const veteran = new Veteran(sampleVeteranData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            veteran.prepareForSave(user);
            
            expect(veteran.metadata.updated_by).to.equal('Admin User');
            expect(veteran.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('should set created_at and created_by if not present', () => {
            const veteran = new Veteran(sampleVeteranData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            veteran.prepareForSave(user);
            
            expect(veteran.metadata.created_by).to.equal('Admin User');
            expect(veteran.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });
    });

    describe('updateHistory', () => {
        it('should track flight changes', () => {
            const currentVeteran = new Veteran(sampleVeteranData);
            const newVeteran = new Veteran(sampleVeteranData);
            newVeteran.flight.bus = 'Bravo1';
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newVeteran.updateHistory(currentVeteran, user);
            
            expect(newVeteran.flight.history).to.have.lengthOf(1);
            expect(newVeteran.flight.history[0].change).to.include('changed bus from Alpha1 to Bravo1');
        });

        it('should track mail call changes', () => {
            const currentVeteran = new Veteran(sampleVeteranData);
            const newVeteran = new Veteran(sampleVeteranData);
            newVeteran.mail_call.received = true;
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newVeteran.updateHistory(currentVeteran, user);
            
            expect(newVeteran.call.history).to.have.lengthOf(1);
            expect(newVeteran.call.history[0].change).to.include('changed mail_call received');
        });
    });

    describe('toJSON', () => {
        it('should convert veteran to JSON format', () => {
            const veteran = new Veteran(sampleVeteranData);
            const json = veteran.toJSON();
            
            expect(json).to.have.property('type', 'Veteran');
            expect(json.name).to.deep.equal(sampleVeteranData.name);
            expect(json.address).to.deep.equal(sampleVeteranData.address);
        });
    });

    describe('fromJSON', () => {
        it('should create veteran instance from JSON', () => {
            const veteran = Veteran.fromJSON(sampleVeteranData);
            
            expect(veteran).to.be.instanceof(Veteran);
            expect(veteran.name.first).to.equal(sampleVeteranData.name.first);
            expect(veteran.address.city).to.equal(sampleVeteranData.address.city);
        });
    });

    describe('getValue', () => {
        it('should handle nested object paths', () => {
            const veteran = new Veteran(sampleVeteranData);
            
            expect(veteran.getValue(veteran, 'name.first')).to.equal('John');
            expect(veteran.getValue(veteran, 'address.city')).to.equal('Springfield');
            expect(veteran.getValue(veteran, 'invalid.path')).to.be.undefined;
        });
    });

    describe('checkForChanges', () => {
        it('should track multiple types of changes', () => {
            const currentVeteran = new Veteran(sampleVeteranData);
            const newVeteran = new Veteran(sampleVeteranData);
            const user = { firstName: 'Admin', lastName: 'User' };
            const timestamp = new Date().toISOString().split('.')[0] + 'Z';

            // Test flight changes
            newVeteran.checkForChanges(
                currentVeteran,
                'flight.history',
                { property: 'flight.status', name: 'status' },
                'Admin User',
                timestamp
            );

            // Test mail call changes
            newVeteran.mail_call.received = true;
            newVeteran.checkForChanges(
                currentVeteran,
                'call.history',
                { property: 'mail_call.received', name: 'mail_call received' },
                'Admin User',
                timestamp
            );
        });
    });
}); 