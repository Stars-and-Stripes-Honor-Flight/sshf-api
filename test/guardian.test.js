import { expect } from 'chai';
import { Guardian } from '../models/guardian.js';

describe('Guardian Model', () => {
    let baseSampleData, sampleGuardianData;

    beforeEach(() => {
        // Define base sample data
        baseSampleData = {
            type: 'Guardian',
            name: {
                first: 'Jane',
                middle: 'Marie',
                last: 'Doe',
                nickname: 'Janie'
            },
            birth_date: '1965-05-15',
            gender: 'F',
            address: {
                street: '456 Oak St',
                city: 'Springfield',
                state: 'IL',
                zip: '62701',
                county: 'Sangamon',
                phone_day: '217-555-4321',
                phone_eve: '217-555-8765',
                phone_mbl: '217-555-2109',
                email: 'jane.doe@email.com'
            },
            flight: {
                id: 'SSHF-2024',
                status: 'Active',
                bus: 'Alpha1',
                seat: '1B'
            },
            medical: {
                level: 'B',
                food_restriction: 'None'
            },
            weight: '140'
        };

        // Deep clone the sample data for each test
        sampleGuardianData = JSON.parse(JSON.stringify(baseSampleData));
    });

    describe('constructor', () => {
        it('should create a valid guardian instance with provided data', () => {
            const guardian = new Guardian(sampleGuardianData);
            expect(guardian.type).to.equal('Guardian');
            expect(guardian.name.first).to.equal('Jane');
            expect(guardian.address.city).to.equal('Springfield');
        });

        it('should create a guardian instance with default values when no data provided', () => {
            const guardian = new Guardian();
            expect(guardian.type).to.equal('Guardian');
            expect(guardian.name.first).to.equal('');
            expect(guardian.flight.status).to.equal('Active');
        });

        it('should initialize veteran fields with default values', () => {
            const guardian = new Guardian();
            
            // Test veteran object initialization
            expect(guardian.veteran).to.be.an('object');
            expect(guardian.veteran.pref_notes).to.equal('');
            expect(guardian.veteran.history).to.be.an('array').that.is.empty;
            expect(guardian.veteran.pairings).to.be.an('array').that.is.empty;
        });

        it('should initialize metadata fields with default values', () => {
            const guardian = new Guardian();
            
            // Test metadata object initialization
            expect(guardian.metadata).to.be.an('object');
            expect(guardian.metadata.created_at).to.equal('');
            expect(guardian.metadata.created_by).to.equal('');
            expect(guardian.metadata.updated_at).to.equal('');
            expect(guardian.metadata.updated_by).to.equal('');
        });

        it('should initialize flight fields with default values', () => {
            const guardian = new Guardian();
            
            // Test flight object initialization
            expect(guardian.flight).to.be.an('object');
            expect(guardian.flight.id).to.equal('None');
            expect(guardian.flight.status).to.equal('Active');
            expect(guardian.flight.group).to.equal('');
            expect(guardian.flight.bus).to.equal('None');
            expect(guardian.flight.seat).to.equal('');
            expect(guardian.flight.confirmed_date).to.equal('');
            expect(guardian.flight.confirmed_by).to.equal('');
            expect(guardian.flight.status_note).to.equal('');
            expect(guardian.flight.history).to.be.an('array').that.is.empty;
            expect(guardian.flight.nofly).to.be.false;
            expect(guardian.flight.vaccinated).to.be.false;
            expect(guardian.flight.mediaWaiver).to.be.false;
            expect(guardian.flight.infection_test).to.be.false;
            expect(guardian.flight.waiver).to.be.false;
            expect(guardian.flight.training).to.equal('');
            expect(guardian.flight.training_notes).to.equal('');
            expect(guardian.flight.training_see_doc).to.be.false;
            expect(guardian.flight.training_complete).to.be.false;
            expect(guardian.flight.paid).to.be.false;
            expect(guardian.flight.exempt).to.be.false;
            expect(guardian.flight.booksOrdered).to.equal(0);
        });

        it('should initialize medical fields with default values', () => {
            const guardian = new Guardian();
            
            // Test medical object initialization
            expect(guardian.medical).to.be.an('object');
            expect(guardian.medical.form).to.be.false;
            expect(guardian.medical.release).to.be.false;
            expect(guardian.medical.level).to.equal('');
            expect(guardian.medical.limitations).to.equal('');
            expect(guardian.medical.food_restriction).to.equal('None');
            expect(guardian.medical.experience).to.equal('');
            expect(guardian.medical.can_push).to.be.false;
            expect(guardian.medical.can_lift).to.be.false;
        });

        it('should initialize name fields with default values', () => {
            const guardian = new Guardian();
            
            // Test name object initialization
            expect(guardian.name).to.be.an('object');
            expect(guardian.name.first).to.equal('');
            expect(guardian.name.middle).to.equal('');
            expect(guardian.name.last).to.equal('');
            expect(guardian.name.nickname).to.equal('');
        });

        it('should initialize address fields with default values', () => {
            const guardian = new Guardian();
            
            // Test address object initialization
            expect(guardian.address).to.be.an('object');
            expect(guardian.address.street).to.equal('');
            expect(guardian.address.city).to.equal('');
            expect(guardian.address.state).to.equal('');
            expect(guardian.address.zip).to.equal('');
            expect(guardian.address.county).to.equal('');
            expect(guardian.address.phone_day).to.equal('');
            expect(guardian.address.phone_eve).to.equal('');
            expect(guardian.address.phone_mbl).to.equal('');
            expect(guardian.address.email).to.equal('');
        });

        it('should initialize emergency contact fields with default values', () => {
            const guardian = new Guardian();
            
            // Test emergency contact initialization
            expect(guardian.emerg_contact).to.be.an('object');
            expect(guardian.emerg_contact.name).to.equal('');
            expect(guardian.emerg_contact.relation).to.equal('');
            expect(guardian.emerg_contact.address).to.be.an('object');
            expect(guardian.emerg_contact.address.phone).to.equal('');
            expect(guardian.emerg_contact.address.email).to.equal('');
        });

        it('should initialize mail call fields with default values', () => {
            const guardian = new Guardian();
            
            // Test mail call initialization
            expect(guardian.mail_call).to.be.an('object');
            expect(guardian.mail_call.received).to.equal('');
            expect(guardian.mail_call.name).to.equal('');
            expect(guardian.mail_call.notes).to.equal('');
            expect(guardian.mail_call.relation).to.equal('');
            expect(guardian.mail_call.address).to.be.an('object');
            expect(guardian.mail_call.address.phone).to.equal('');
            expect(guardian.mail_call.address.email).to.equal('');
        });

        it('should initialize call fields with default values', () => {
            const guardian = new Guardian();
            
            // Test call initialization
            expect(guardian.call).to.be.an('object');
            expect(guardian.call.fm_number).to.equal('');
            expect(guardian.call.notes).to.equal('');
            expect(guardian.call.email_sent).to.be.false;
            expect(guardian.call.assigned_to).to.equal('');
            expect(guardian.call.mail_sent).to.be.false;
            expect(guardian.call.history).to.be.an('array').that.is.empty;
        });

        it('should properly initialize fields from provided data', () => {
            const data = {
                veteran: {
                    pref_notes: 'Prefers older veterans',
                    history: [{ id: '2024-01-01T12:00:00Z', change: 'Initial note' }],
                    pairings: [{ id: 'V123', name: 'John Smith' }]
                },
                app_date: '2024-01-01',
                shirt: {
                    size: 'L'
                },
                metadata: {
                    created_at: '2024-01-01T12:00:00Z',
                    created_by: 'John Admin',
                    updated_at: '2024-01-02T12:00:00Z',
                    updated_by: 'Jane Admin'
                }
            };

            const guardian = new Guardian(data);
            
            // Test veteran initialization from data
            expect(guardian.veteran.pref_notes).to.equal('Prefers older veterans');
            expect(guardian.veteran.history).to.deep.equal([{ 
                id: '2024-01-01T12:00:00Z', 
                change: 'Initial note' 
            }]);
            expect(guardian.veteran.pairings).to.deep.equal([{
                id: 'V123',
                name: 'John Smith'
            }]);
            
            // Test other fields initialization from data
            expect(guardian.app_date).to.equal('2024-01-01');
            expect(guardian.shirt.size).to.equal('L');
            
            // Test metadata initialization from data
            expect(guardian.metadata.created_at).to.equal('2024-01-01T12:00:00Z');
            expect(guardian.metadata.created_by).to.equal('John Admin');
            expect(guardian.metadata.updated_at).to.equal('2024-01-02T12:00:00Z');
            expect(guardian.metadata.updated_by).to.equal('Jane Admin');
        });
    });

    describe('validate', () => {
        it('should validate a properly formed guardian', () => {
            const guardian = new Guardian(sampleGuardianData);
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should require proper names', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test missing first name
            guardian.name.first = '';
            expect(() => guardian.validate()).to.throw('First name is required');
            
            // Test invalid first name with numbers
            guardian.name.first = 'Jane123';
            expect(() => guardian.validate()).to.throw('First name is required and must contain only letters');
            
            // Test short first name
            guardian.name.first = 'J';
            expect(() => guardian.validate()).to.throw('First name is required and must contain only letters');
            
            // Test missing last name
            guardian.name.first = 'Jane';
            guardian.name.last = '';
            expect(() => guardian.validate()).to.throw('Last name is required');
            
            // Test invalid last name with special characters
            guardian.name.last = 'Doe#';
            expect(() => guardian.validate()).to.throw('Last name is required and must contain only letters');
            
            // Reset to valid names
            guardian.name.first = 'Jane';
            guardian.name.last = 'Doe';
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate address fields', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test missing street
            guardian.address.street = '';
            expect(() => guardian.validate()).to.throw('Street address is required');
            
            // Test missing city
            guardian.address.street = '456 Oak St';
            guardian.address.city = '';
            expect(() => guardian.validate()).to.throw('City is required');
            
            // Test missing county
            guardian.address.city = 'Springfield';
            guardian.address.county = '';
            expect(() => guardian.validate()).to.throw('County is required');
            
            // Test invalid state format
            guardian.address.county = 'Sangamon';
            guardian.address.state = 'Illinois'; // Should be 2 letters
            expect(() => guardian.validate()).to.throw('State is required and must be exactly 2 letters');
            
            // Test missing zip
            guardian.address.state = 'IL';
            guardian.address.zip = '';
            expect(() => guardian.validate()).to.throw('ZIP code is required');
            
            // Test missing day phone
            guardian.address.zip = '62701';
            guardian.address.phone_day = '';
            expect(() => guardian.validate()).to.throw('Day phone is required');
            
            // Valid address
            guardian.address.phone_day = '217-555-4321';
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate gender', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid gender
            guardian.gender = 'X';
            expect(() => guardian.validate()).to.throw('Gender must be M or F');
            
            // Test valid gender options
            guardian.gender = 'M';
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.gender = 'F';
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate weight format', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid weight formats
            guardian.weight = '45';  // Too low
            expect(() => guardian.validate()).to.throw('Weight must be a number between 60-450');
            
            guardian.weight = '500';  // Too high
            expect(() => guardian.validate()).to.throw('Weight must be a number between 60-450');
            
            guardian.weight = '12a';  // Non-numeric
            expect(() => guardian.validate()).to.throw('Weight must be a number between 60-450');
            
            // Test valid weights
            guardian.weight = '140';  // Normal
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.weight = '';  // Empty string (optional field)
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate document type', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid document types
            guardian.type = '';  // Empty string
            expect(() => guardian.validate()).to.throw('Document type must be Guardian');
            
            guardian.type = 'Veteran';  // Wrong type
            expect(() => guardian.validate()).to.throw('Document type must be Guardian');
            
            guardian.type = 'guardian';  // Wrong case
            expect(() => guardian.validate()).to.throw('Document type must be Guardian');
            
            // Test valid document type
            guardian.type = 'Guardian';
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate medical fields', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid medical level
            guardian.medical.level = 'E';
            expect(() => guardian.validate()).to.throw('Medical level must be A, B, C, or D');
            
            // Test valid medical levels
            const validLevels = ['A', 'B', 'C', 'D'];
            validLevels.forEach(level => {
                guardian.medical.level = level;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test invalid food restriction
            guardian.medical.food_restriction = 'Keto';
            expect(() => guardian.validate()).to.throw('Invalid food restriction');
            
            // Test valid food restrictions
            const validRestrictions = ['None', 'Gluten Free', 'Vegetarian', 'Vegan'];
            validRestrictions.forEach(restriction => {
                guardian.medical.food_restriction = restriction;
                expect(() => guardian.validate()).to.not.throw();
            });
        });

        it('should validate flight fields', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid flight status
            guardian.flight.status = 'Pending';
            expect(() => guardian.validate()).to.throw('Invalid flight status');
            
            // Test valid flight statuses
            const validStatuses = ['Active', 'Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction', 'Copied'];
            validStatuses.forEach(status => {
                guardian.flight.status = status;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test invalid bus assignment
            guardian.flight.bus = 'Delta1';
            expect(() => guardian.validate()).to.throw('Invalid bus assignment');
            
            // Test valid bus assignments
            const validBuses = ['None', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5', 'Bravo1', 'Bravo2', 'Bravo3', 'Bravo4', 'Bravo5'];
            validBuses.forEach(bus => {
                guardian.flight.bus = bus;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test invalid training type
            guardian.flight.training = 'Online';
            expect(() => guardian.validate()).to.throw('Invalid training type');
            
            // Test valid training types
            const validTrainingTypes = ['None', 'Main', 'Previous', 'Phone', 'Web', 'Make-up'];
            validTrainingTypes.forEach(type => {
                guardian.flight.training = type;
                expect(() => guardian.validate()).to.not.throw();
            });
        });

        it('should validate history entries', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid flight history timestamp format
            guardian.flight.history = [{
                id: '2024/01/01 12:00:00',  // Wrong format
                change: 'Test change'
            }];
            expect(() => guardian.validate()).to.throw('Flight history entry 1 has invalid timestamp format');
            
            // Test valid flight history entry
            guardian.flight.history = [{
                id: '2024-01-01T12:00:00Z',
                change: 'Valid change description'
            }];
            expect(() => guardian.validate()).to.not.throw();
            
            // Test missing change description in flight history
            guardian.flight.history = [{
                id: '2024-01-01T12:00:00Z',
                // change field missing
            }];
            expect(() => guardian.validate()).to.throw('Flight history entry 1 must have a change description');
            
            // Test non-string change description in flight history
            guardian.flight.history = [{
                id: '2024-01-01T12:00:00Z',
                change: 123 // Number instead of string
            }];
            expect(() => guardian.validate()).to.throw('Flight history entry 1 must have a change description');
            
            // Test empty string change description in flight history
            guardian.flight.history = [{
                id: '2024-01-01T12:00:00Z',
                change: ''
            }];
            expect(() => guardian.validate()).to.throw();
            
            // Reset flight history to valid state
            guardian.flight.history = [];
            
            // Test invalid call history entry
            guardian.call.history = [{
                id: 'invalid-date',
                change: 'Test change'
            }];
            expect(() => guardian.validate()).to.throw('Call history entry 1 has invalid timestamp format');
            
            // Test missing change description in call history
            guardian.call.history = [{
                id: '2024-01-01T12:00:00Z',
                // change field missing
            }];
            expect(() => guardian.validate()).to.throw('Call history entry 1 must have a change description');
            
            // Test non-string change description in call history
            guardian.call.history = [{
                id: '2024-01-01T12:00:00Z',
                change: 123 // Number instead of string
            }];
            expect(() => guardian.validate()).to.throw('Call history entry 1 must have a change description');
            
            // Test empty string change description in call history
            guardian.call.history = [{
                id: '2024-01-01T12:00:00Z',
                change: ''
            }];
            expect(() => guardian.validate()).to.throw();
            
            // Test multiple call history entries with mixed validity
            guardian.call.history = [
                {
                    id: '2024-01-01T12:00:00Z',
                    change: 'Valid change 1'
                },
                {
                    id: '2024-01-02T12:00:00Z',
                    // change field missing
                }
            ];
            expect(() => guardian.validate()).to.throw('Call history entry 2 must have a change description');
            
            // Test valid multiple call history entries
            guardian.call.history = [
                {
                    id: '2024-01-01T12:00:00Z',
                    change: 'Valid change 1'
                },
                {
                    id: '2024-01-02T12:00:00Z',
                    change: 'Valid change 2'
                }
            ];
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate veteran pairings', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid veteran pairing without id
            guardian.veteran.pairings = [{
                name: 'John Smith'
                // missing id
            }];
            expect(() => guardian.validate()).to.throw('Veteran pairing 1 must have a valid id');
            
            // Test invalid veteran pairing without name
            guardian.veteran.pairings = [{
                id: 'V123'
                // missing name
            }];
            expect(() => guardian.validate()).to.throw('Veteran pairing 1 must have a valid name');
            
            // Test valid veteran pairing
            guardian.veteran.pairings = [{
                id: 'V123',
                name: 'John Smith'
            }];
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate email formats', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid email formats
            guardian.address.email = 'invalid-email';
            expect(() => guardian.validate()).to.throw('Email must be a valid email address');
            
            guardian.address.email = 'jane.doe@';
            expect(() => guardian.validate()).to.throw('Email must be a valid email address');
            
            // Test valid email
            guardian.address.email = 'jane.doe@email.com';
            expect(() => guardian.validate()).to.not.throw();
            
            // Test emergency contact email validation
            guardian.emerg_contact.address.email = 'invalid-email';
            expect(() => guardian.validate()).to.throw('Emergency contact email must be a valid email address');
            
            guardian.emerg_contact.address.email = 'contact@email.com';
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate emergency contact name formats', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid emergency contact name formats
            guardian.emerg_contact.name = 'A'; // Too short (< 2 chars)
            expect(() => guardian.validate()).to.throw('Emergency contact name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            guardian.emerg_contact.name = 'John123'; // With numbers
            expect(() => guardian.validate()).to.throw('Emergency contact name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            guardian.emerg_contact.name = 'John$Doe'; // With special characters
            expect(() => guardian.validate()).to.throw('Emergency contact name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            // Test valid emergency contact name formats
            guardian.emerg_contact.name = 'John Doe'; // With space
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.emerg_contact.name = "John O'Brien"; // With apostrophe
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.emerg_contact.name = 'Dr. John'; // With period
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.emerg_contact.name = 'Smith-Jones'; // With hyphen
            expect(() => guardian.validate()).to.not.throw();
        });
        
        it('should validate emergency contact phone formats', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid emergency contact phone formats
            guardian.emerg_contact.address.phone = '555-123'; // Too short (< 12 chars)
            expect(() => guardian.validate()).to.throw('Emergency contact phone must contain at least 12 digits/characters');
            
            guardian.emerg_contact.address.phone = '555-123-ABC'; // With letters
            expect(() => guardian.validate()).to.throw('Emergency contact phone must contain at least 12 digits/characters');
            
            guardian.emerg_contact.address.phone = '555@123@4567'; // With special characters
            expect(() => guardian.validate()).to.throw('Emergency contact phone must contain at least 12 digits/characters');
            
            // Test valid emergency contact phone formats
            guardian.emerg_contact.address.phone = '217-555-1234'; // 12 chars with hyphens
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.emerg_contact.address.phone = '217 555 1234'; // 12 chars with spaces
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.emerg_contact.address.phone = '1-217-555-1234'; // More than 12 chars
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate evening and mobile phone formats', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid evening phone formats
            guardian.address.phone_eve = '555-123-ABC'; // With letters
            expect(() => guardian.validate()).to.throw('Evening phone must contain only numbers, spaces and hyphens');
            
            guardian.address.phone_eve = '555@123@4567'; // With special characters
            expect(() => guardian.validate()).to.throw('Evening phone must contain only numbers, spaces and hyphens');
            
            // Test valid evening phone formats
            guardian.address.phone_eve = '217-555-5678'; // With hyphens
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.address.phone_eve = '217 555 5678'; // With spaces
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.address.phone_eve = '2175555678'; // Numbers only
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty evening phone (optional field)
            guardian.address.phone_eve = '';
            expect(() => guardian.validate()).to.not.throw();
            
            // Test invalid mobile phone formats
            guardian.address.phone_mbl = '555-123-ABC'; // With letters
            expect(() => guardian.validate()).to.throw('Mobile phone must contain only numbers, spaces and hyphens');
            
            guardian.address.phone_mbl = '555+123+4567'; // With special characters
            expect(() => guardian.validate()).to.throw('Mobile phone must contain only numbers, spaces and hyphens');
            
            // Test valid mobile phone formats
            guardian.address.phone_mbl = '217-555-2109'; // With hyphens
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.address.phone_mbl = '217 555 2109'; // With spaces
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.address.phone_mbl = '2175552109'; // Numbers only
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty mobile phone (optional field)
            guardian.address.phone_mbl = '';
            expect(() => guardian.validate()).to.not.throw();
        });

        it('should validate apparel fields', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid jacket size
            guardian.apparel.jacket_size = 'XXL';
            expect(() => guardian.validate()).to.throw('Invalid jacket size');
            
            // Test valid jacket sizes
            const validJacketSizes = ['None', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
            validJacketSizes.forEach(size => {
                guardian.apparel.jacket_size = size;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test invalid shirt size
            guardian.apparel.shirt_size = 'XXL';
            expect(() => guardian.validate()).to.throw('Invalid shirt size');
            
            // Test valid shirt sizes
            const validShirtSizes = ['None', 'WXS', 'WS', 'WM', 'WL', 'WXL', 'W2XL', 'W3XL', 'W4XL', 'W5XL', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
            validShirtSizes.forEach(size => {
                guardian.apparel.shirt_size = size;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test invalid delivery method
            guardian.apparel.delivery = 'Shipped';
            expect(() => guardian.validate()).to.throw('Invalid delivery method');
            
            // Test valid delivery methods
            const validDeliveryMethods = ['None', 'Mailed', 'Training', 'Home'];
            validDeliveryMethods.forEach(method => {
                guardian.apparel.delivery = method;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test invalid apparel item
            guardian.apparel.item = 'T-Shirt';
            expect(() => guardian.validate()).to.throw('Invalid apparel item');
            
            // Test valid apparel items
            const validApparelItems = ['None', 'Jacket', 'Polo', 'Both'];
            validApparelItems.forEach(item => {
                guardian.apparel.item = item;
                expect(() => guardian.validate()).to.not.throw();
            });
        });

        it('should validate names formats', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid middle name formats
            guardian.name.middle = 'Marie123'; // With numbers
            expect(() => guardian.validate()).to.throw('Middle name must contain only letters, apostrophes and spaces');
            
            guardian.name.middle = 'Marie#'; // With special characters
            expect(() => guardian.validate()).to.throw('Middle name must contain only letters, apostrophes and spaces');
            
            // Test valid middle name formats
            guardian.name.middle = 'Marie'; // Plain letters
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.name.middle = "Mary Ann"; // With space
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.name.middle = "O'Brien"; // With apostrophe
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty middle name (optional field)
            guardian.name.middle = '';
            expect(() => guardian.validate()).to.not.throw();
            
            // Test invalid nickname formats
            guardian.name.nickname = 'Janie123'; // With numbers
            expect(() => guardian.validate()).to.throw('Nickname must contain only letters, periods, apostrophes and spaces');
            
            guardian.name.nickname = 'Janie#'; // With special characters
            expect(() => guardian.validate()).to.throw('Nickname must contain only letters, periods, apostrophes and spaces');
            
            // Test valid nickname formats
            guardian.name.nickname = 'Janie'; // Plain letters
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.name.nickname = 'J.'; // With period
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.name.nickname = "Jamie O'Hara"; // With apostrophe and space
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty nickname (optional field)
            guardian.name.nickname = '';
            expect(() => guardian.validate()).to.not.throw();
        });
        
        it('should validate mail call fields', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid mail call name formats
            guardian.mail_call.name = 'J'; // Too short (< 2 chars)
            expect(() => guardian.validate()).to.throw('Mail call name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            guardian.mail_call.name = 'John123'; // With numbers
            expect(() => guardian.validate()).to.throw('Mail call name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            guardian.mail_call.name = 'John$Smith'; // With special characters
            expect(() => guardian.validate()).to.throw('Mail call name must contain only letters, periods, apostrophes, hyphens and spaces (min 2 chars)');
            
            // Test valid mail call name formats
            guardian.mail_call.name = 'John Smith'; // With space
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.mail_call.name = "John O'Brien"; // With apostrophe
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.mail_call.name = 'Dr. John'; // With period
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.mail_call.name = 'Smith-Jones'; // With hyphen
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty mail call name (optional field)
            guardian.mail_call.name = '';
            expect(() => guardian.validate()).to.not.throw();
            
            // Test invalid mail call phone formats
            guardian.mail_call.address.phone = '555-123'; // Too short (< 12 chars)
            expect(() => guardian.validate()).to.throw('Mail call phone must contain at least 12 digits/characters');
            
            // Test valid mail call phone formats
            guardian.mail_call.address.phone = '217-555-6789'; // 12 chars with hyphens
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.mail_call.address.phone = '217 555 6789'; // 12 chars with spaces
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.mail_call.address.phone = '1-217-555-6789'; // More than 12 chars
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty mail call phone (optional field)
            guardian.mail_call.address.phone = '';
            expect(() => guardian.validate()).to.not.throw();
            
            // Test invalid mail call email formats
            guardian.mail_call.address.email = 'invalid-email';
            expect(() => guardian.validate()).to.throw('Mail call email must be a valid email address');
            
            guardian.mail_call.address.email = 'mail@';
            expect(() => guardian.validate()).to.throw('Mail call email must be a valid email address');
            
            // Test valid mail call email format
            guardian.mail_call.address.email = 'mail@example.com';
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty mail call email (optional field)
            guardian.mail_call.address.email = '';
            expect(() => guardian.validate()).to.not.throw();
        });
        
        it('should validate notes service field', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid service value
            guardian.notes.service = 'X'; // Not Y or N
            expect(() => guardian.validate()).to.throw('Service notes must be Y or N');
            
            // Empty string should not cause an error since the model provides default 'N'
            guardian.notes.service = '';
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.notes.service = 'yes'; // Full word instead of single letter
            expect(() => guardian.validate()).to.throw('Service notes must be Y or N');
            
            // Test valid service values
            guardian.notes.service = 'Y'; // Yes
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.notes.service = 'N'; // No
            expect(() => guardian.validate()).to.not.throw();
        });
        
        it('should validate birth date format', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid birth date formats
            guardian.birth_date = '05/15/1965'; // MM/DD/YYYY format
            expect(() => guardian.validate()).to.throw('Birth date must be in YYYY-MM-DD format');
            
            guardian.birth_date = '1965.05.15'; // With periods
            expect(() => guardian.validate()).to.throw('Birth date must be in YYYY-MM-DD format');
            
            guardian.birth_date = '19650515'; // Without separators
            expect(() => guardian.validate()).to.throw('Birth date must be in YYYY-MM-DD format');
            
            guardian.birth_date = '1965-5-15'; // Missing leading zero
            expect(() => guardian.validate()).to.throw('Birth date must be in YYYY-MM-DD format');
            
            guardian.birth_date = '65-05-15'; // Two-digit year
            expect(() => guardian.validate()).to.throw('Birth date must be in YYYY-MM-DD format');
            
            // Test valid birth date format
            guardian.birth_date = '1965-05-15'; // YYYY-MM-DD format
            expect(() => guardian.validate()).to.not.throw();
            
            guardian.birth_date = '2000-01-01'; // YYYY-MM-DD format
            expect(() => guardian.validate()).to.not.throw();
            
            // Test empty birth date (optional field)
            guardian.birth_date = '';
            expect(() => guardian.validate()).to.not.throw();
        });
        
        it('should validate shirt size', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid shirt sizes
            guardian.shirt.size = 'XXL';
            expect(() => guardian.validate()).to.throw('Invalid shirt size');
            
            guardian.shirt.size = 'Medium';
            expect(() => guardian.validate()).to.throw('Invalid shirt size');
            
            guardian.shirt.size = 'Extra Large';
            expect(() => guardian.validate()).to.throw('Invalid shirt size');
            
            guardian.shirt.size = '6XL';
            expect(() => guardian.validate()).to.throw('Invalid shirt size');
            
            // Test valid shirt sizes
            const validShirtSizes = ['None', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
            validShirtSizes.forEach(size => {
                guardian.shirt.size = size;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test empty shirt size (defaults to 'None')
            guardian.shirt.size = '';
            expect(() => guardian.validate()).to.not.throw();
        });
        
        it('should validate accommodations room type', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            // Test invalid room types
            guardian.accommodations.room_type = 'Suite';
            expect(() => guardian.validate()).to.throw('Invalid room type');
            
            guardian.accommodations.room_type = 'Queen';
            expect(() => guardian.validate()).to.throw('Invalid room type');
            
            guardian.accommodations.room_type = 'twin';  // Case sensitive
            expect(() => guardian.validate()).to.throw('Invalid room type');
            
            // Test valid room types
            const validRoomTypes = ['None', 'Double', 'Single'];
            validRoomTypes.forEach(type => {
                guardian.accommodations.room_type = type;
                expect(() => guardian.validate()).to.not.throw();
            });
            
            // Test empty room type (optional field)
            guardian.accommodations.room_type = '';
            expect(() => guardian.validate()).to.not.throw();
        });
    });

    describe('prepareForSave', () => {
        it('should update metadata with user information', () => {
            const guardian = new Guardian(sampleGuardianData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            guardian.prepareForSave(user);
            
            expect(guardian.metadata.updated_by).to.equal('Admin User');
            expect(guardian.metadata.updated_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('should set created_at and created_by if not present', () => {
            const guardian = new Guardian(sampleGuardianData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            // Clear metadata
            guardian.metadata.created_at = '';
            guardian.metadata.created_by = '';
            
            guardian.prepareForSave(user);
            
            expect(guardian.metadata.created_by).to.equal('Admin User');
            expect(guardian.metadata.created_at).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        });

        it('should not overwrite existing created_at and created_by', () => {
            const guardian = new Guardian(sampleGuardianData);
            const user = { firstName: 'Admin', lastName: 'User' };
            
            // Set metadata
            guardian.metadata.created_at = '2023-01-01T12:00:00Z';
            guardian.metadata.created_by = 'Original User';
            
            guardian.prepareForSave(user);
            
            expect(guardian.metadata.created_by).to.equal('Original User');
            expect(guardian.metadata.created_at).to.equal('2023-01-01T12:00:00Z');
            expect(guardian.metadata.updated_by).to.equal('Admin User');
            expect(guardian.metadata.updated_at).to.not.equal('2023-01-01T12:00:00Z');
        });
    });

    describe('updateHistory', () => {
        it('should track flight changes', () => {
            const currentGuardian = new Guardian(sampleGuardianData);
            const newGuardian = new Guardian(sampleGuardianData);
            newGuardian.flight.bus = 'Bravo1';
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newGuardian.updateHistory(currentGuardian, user);
            
            expect(newGuardian.flight.history).to.have.lengthOf(1);
            expect(newGuardian.flight.history[0].change).to.include('changed bus from: Alpha1 to: Bravo1 by: Admin User');
        });

        it('should track call assignment changes', () => {
            const currentGuardian = new Guardian(sampleGuardianData);
            const newGuardian = new Guardian(sampleGuardianData);
            newGuardian.call.assigned_to = 'John Smith';
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newGuardian.updateHistory(currentGuardian, user);
            
            expect(newGuardian.call.history).to.have.lengthOf(1);
            expect(newGuardian.call.history[0].change).to.include('changed assigned caller from:  to: John Smith by: Admin User');
        });

        it('should track multiple changes', () => {
            const currentGuardian = new Guardian(sampleGuardianData);
            const newGuardian = new Guardian(sampleGuardianData);
            
            // Make multiple changes
            newGuardian.flight.bus = 'Bravo1';
            newGuardian.flight.seat = '2A';
            newGuardian.call.fm_number = 'FM123';
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newGuardian.updateHistory(currentGuardian, user);
            
            // Should have two entries in flight history and one in call history
            expect(newGuardian.flight.history).to.have.lengthOf(2);
            expect(newGuardian.call.history).to.have.lengthOf(1);
        });

        it('should not track unchanged fields', () => {
            const currentGuardian = new Guardian(sampleGuardianData);
            const newGuardian = new Guardian(sampleGuardianData);
            
            // Make no changes
            
            const user = { firstName: 'Admin', lastName: 'User' };
            newGuardian.updateHistory(currentGuardian, user);
            
            // Should have no history entries
            expect(newGuardian.flight.history).to.have.lengthOf(0);
            expect(newGuardian.call.history).to.have.lengthOf(0);
        });
    });

    describe('getValue', () => {
        it('should handle nested object paths', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            expect(guardian.getValue(guardian, 'name.first')).to.equal('Jane');
            expect(guardian.getValue(guardian, 'address.city')).to.equal('Springfield');
            expect(guardian.getValue(guardian, 'flight.bus')).to.equal('Alpha1');
        });

        it('should return undefined for invalid paths', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            expect(guardian.getValue(guardian, 'invalid.path')).to.be.undefined;
            expect(guardian.getValue(guardian, 'name.invalid')).to.be.undefined;
            expect(guardian.getValue(guardian, '')).to.be.undefined;
        });

        it('should handle multi-level nested paths', () => {
            const guardian = new Guardian(sampleGuardianData);
            
            expect(guardian.getValue(guardian, 'emerg_contact.address.phone')).to.equal('');
            
            // Set a value and retrieve it
            guardian.emerg_contact.address.phone = '217-555-1234';
            expect(guardian.getValue(guardian, 'emerg_contact.address.phone')).to.equal('217-555-1234');
        });
    });

    describe('checkForChanges', () => {
        it('should detect changes and add to history', () => {
            const currentGuardian = new Guardian(sampleGuardianData);
            const newGuardian = new Guardian(sampleGuardianData);
            const userName = 'Admin User';
            const timestamp = '2024-01-01T12:00:00Z';
            
            // Test with changed property
            newGuardian.flight.bus = 'Bravo1';
            newGuardian.checkForChanges(
                currentGuardian,
                'flight.history',
                { property: 'flight.bus', name: 'bus' },
                userName,
                timestamp
            );
            
            expect(newGuardian.flight.history).to.have.lengthOf(1);
            expect(newGuardian.flight.history[0].id).to.equal(timestamp);
            expect(newGuardian.flight.history[0].change).to.equal('changed bus from: Alpha1 to: Bravo1 by: Admin User');
        });

        it('should not add to history when no change detected', () => {
            const currentGuardian = new Guardian(sampleGuardianData);
            const newGuardian = new Guardian(sampleGuardianData);
            const userName = 'Admin User';
            const timestamp = '2024-01-01T12:00:00Z';
            
            // Test with unchanged property
            newGuardian.checkForChanges(
                currentGuardian,
                'flight.history',
                { property: 'flight.bus', name: 'bus' },
                userName,
                timestamp
            );
            
            expect(newGuardian.flight.history).to.have.lengthOf(0);
        });
    });

    describe('toJSON', () => {
        it('should convert guardian to JSON format', () => {
            const guardian = new Guardian(sampleGuardianData);
            const json = guardian.toJSON();
            
            expect(json).to.have.property('type', 'Guardian');
            expect(json.name).to.deep.equal(sampleGuardianData.name);
            expect(json.address).to.deep.equal(sampleGuardianData.address);
            expect(json.flight).to.deep.equal(guardian.flight);
            expect(json.medical).to.deep.equal(guardian.medical);
            expect(json.veteran).to.deep.equal(guardian.veteran);
        });

        it('should include all guardian properties in JSON', () => {
            const guardian = new Guardian(sampleGuardianData);
            const json = guardian.toJSON();
            
            // Verify all top-level properties exist
            const expectedProperties = [
                '_id', '_rev', 'type', 'name', 'birth_date', 'gender',
                'address', 'flight', 'medical', 'veteran', 'app_date',
                'shirt', 'metadata', 'weight', 'emerg_contact', 'notes',
                'occupation', 'accommodations', 'mail_call', 'call', 'apparel'
            ];
            
            expectedProperties.forEach(prop => {
                expect(json).to.have.property(prop);
            });
        });
    });

    describe('fromJSON', () => {
        it('should create guardian instance from JSON', () => {
            const jsonData = {
                type: 'Guardian',
                name: {
                    first: 'Jane',
                    last: 'Doe'
                },
                address: {
                    street: '456 Oak St',
                    city: 'Springfield'
                }
            };
            
            const guardian = Guardian.fromJSON(jsonData);
            
            expect(guardian).to.be.instanceof(Guardian);
            expect(guardian.name.first).to.equal('Jane');
            expect(guardian.address.city).to.equal('Springfield');
        });

        it('should populate all fields from complete JSON', () => {
            const guardian = Guardian.fromJSON(sampleGuardianData);
            
            expect(guardian.type).to.equal('Guardian');
            expect(guardian.name.first).to.equal('Jane');
            expect(guardian.name.middle).to.equal('Marie');
            expect(guardian.name.last).to.equal('Doe');
            expect(guardian.birth_date).to.equal('1965-05-15');
            expect(guardian.gender).to.equal('F');
            expect(guardian.address.street).to.equal('456 Oak St');
            expect(guardian.flight.bus).to.equal('Alpha1');
            expect(guardian.medical.food_restriction).to.equal('None');
        });
    });
}); 