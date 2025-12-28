import { expect } from 'chai';
import { 
    AssignmentPerson, 
    AssignmentPair, 
    FlightAssignment, 
    AddVeteransResult 
} from '../models/flight_assignment.js';

describe('Flight Assignment Models', () => {
    
    describe('AssignmentPerson', () => {
        describe('constructor', () => {
            it('should create an AssignmentPerson with default values', () => {
                const person = new AssignmentPerson();
                expect(person.type).to.equal('');
                expect(person.id).to.equal('');
                expect(person.name_first).to.equal('');
                expect(person.name_last).to.equal('');
                expect(person.city).to.equal('');
                expect(person.appdate).to.equal('');
                expect(person.group).to.equal('');
                expect(person.nofly).to.equal(false);
                expect(person.fm_number).to.equal('');
                expect(person.assigned_to).to.equal('');
                expect(person.mail_sent).to.equal(false);
                expect(person.email_sent).to.equal(false);
                expect(person.confirmed).to.equal('');
                expect(person.paired_with).to.equal('');
            });

            it('should create an AssignmentPerson with provided values', () => {
                const data = {
                    type: 'Veteran',
                    id: 'vet-123',
                    name_first: 'John',
                    name_last: 'Smith',
                    city: 'Chicago',
                    appdate: '2024-01-15',
                    group: 'GroupA',
                    nofly: false,
                    fm_number: 'FM-001',
                    assigned_to: 'Caller1',
                    mail_sent: true,
                    email_sent: true,
                    confirmed: '2024-02-01',
                    paired_with: 'guard-456'
                };
                const person = new AssignmentPerson(data);
                expect(person.type).to.equal('Veteran');
                expect(person.id).to.equal('vet-123');
                expect(person.name_first).to.equal('John');
                expect(person.name_last).to.equal('Smith');
                expect(person.city).to.equal('Chicago');
                expect(person.appdate).to.equal('2024-01-15');
                expect(person.group).to.equal('GroupA');
                expect(person.nofly).to.equal(false);
                expect(person.fm_number).to.equal('FM-001');
                expect(person.assigned_to).to.equal('Caller1');
                expect(person.mail_sent).to.equal(true);
                expect(person.email_sent).to.equal(true);
                expect(person.confirmed).to.equal('2024-02-01');
                expect(person.paired_with).to.equal('guard-456');
            });

            it('should parse boolean properties correctly - whitespace treated as false', () => {
                const data = {
                    nofly: ' ',      // whitespace should be false
                    mail_sent: '  ', // whitespace should be false
                    email_sent: ' '  // whitespace should be false
                };
                const person = new AssignmentPerson(data);
                expect(person.nofly).to.equal(false);
                expect(person.mail_sent).to.equal(false);
                expect(person.email_sent).to.equal(false);
            });

            it('should parse boolean properties correctly - string "true" treated as true', () => {
                const data = {
                    nofly: 'true',
                    mail_sent: 'TRUE',
                    email_sent: 'True'
                };
                const person = new AssignmentPerson(data);
                expect(person.nofly).to.equal(true);
                expect(person.mail_sent).to.equal(true);
                expect(person.email_sent).to.equal(true);
            });

            it('should parse boolean properties correctly - boolean true treated as true', () => {
                const data = {
                    nofly: true,
                    mail_sent: true,
                    email_sent: true
                };
                const person = new AssignmentPerson(data);
                expect(person.nofly).to.equal(true);
                expect(person.mail_sent).to.equal(true);
                expect(person.email_sent).to.equal(true);
            });

            it('should parse boolean properties correctly - other values treated as false', () => {
                const data = {
                    nofly: 'yes',
                    mail_sent: 1,
                    email_sent: 'false'
                };
                const person = new AssignmentPerson(data);
                expect(person.nofly).to.equal(false);
                expect(person.mail_sent).to.equal(false);
                expect(person.email_sent).to.equal(false);
            });
        });

        describe('toJSON', () => {
            it('should return all properties in JSON format', () => {
                const person = new AssignmentPerson({
                    type: 'Guardian',
                    id: 'guard-789',
                    name_first: 'Jane',
                    name_last: 'Doe'
                });
                const json = person.toJSON();
                expect(json).to.have.all.keys([
                    'type', 'id', 'name_first', 'name_last', 'city', 'appdate',
                    'group', 'nofly', 'fm_number', 'assigned_to', 'mail_sent',
                    'email_sent', 'confirmed', 'paired_with'
                ]);
                expect(json.type).to.equal('Guardian');
                expect(json.name_first).to.equal('Jane');
            });
        });

        describe('fromViewRow', () => {
            it('should create AssignmentPerson from view row data', () => {
                const row = {
                    type: 'Veteran',
                    id: 'vet-abc',
                    name_first: 'Bob',
                    name_last: 'Jones',
                    city: 'Milwaukee',
                    appdate: '2024-03-01',
                    group: 'GroupB',
                    nofly: true,
                    fm_number: 'FM-002',
                    assigned_to: 'Caller2',
                    mail_sent: false,
                    email_sent: true,
                    confirmed: '',
                    paired_with: ''
                };
                const person = AssignmentPerson.fromViewRow(row);
                expect(person).to.be.instanceOf(AssignmentPerson);
                expect(person.type).to.equal('Veteran');
                expect(person.id).to.equal('vet-abc');
                expect(person.name_first).to.equal('Bob');
                expect(person.nofly).to.equal(true);
            });

            it('should handle missing properties with defaults', () => {
                const row = {};
                const person = AssignmentPerson.fromViewRow(row);
                expect(person.type).to.equal('');
                expect(person.id).to.equal('');
                expect(person.nofly).to.equal(false);
            });
        });
    });

    describe('AssignmentPair', () => {
        describe('constructor', () => {
            it('should create an AssignmentPair with default values', () => {
                const pair = new AssignmentPair();
                expect(pair.pairId).to.equal('');
                expect(pair.group).to.equal('');
                expect(pair.appDate).to.equal('');
                expect(pair.missingPerson).to.equal(false);
                expect(pair.people).to.deep.equal([]);
            });

            it('should create an AssignmentPair with provided values', () => {
                const data = {
                    pairId: 'pair-123',
                    group: 'GroupA',
                    appDate: '2024-01-15',
                    missingPerson: false,
                    people: [new AssignmentPerson({ type: 'Veteran' })]
                };
                const pair = new AssignmentPair(data);
                expect(pair.pairId).to.equal('pair-123');
                expect(pair.group).to.equal('GroupA');
                expect(pair.appDate).to.equal('2024-01-15');
                expect(pair.people.length).to.equal(1);
            });

            it('should parse missingPerson boolean correctly - whitespace treated as false', () => {
                const pair = new AssignmentPair({ missingPerson: ' ' });
                expect(pair.missingPerson).to.equal(false);
            });

            it('should parse missingPerson boolean correctly - string "true" treated as true', () => {
                const pair = new AssignmentPair({ missingPerson: 'true' });
                expect(pair.missingPerson).to.equal(true);
            });

            it('should parse missingPerson boolean correctly - boolean true treated as true', () => {
                const pair = new AssignmentPair({ missingPerson: true });
                expect(pair.missingPerson).to.equal(true);
            });
        });

        describe('addPerson', () => {
            it('should add a person to the pair', () => {
                const pair = new AssignmentPair();
                const person = new AssignmentPerson({ type: 'Veteran', id: 'vet-1' });
                pair.addPerson(person);
                expect(pair.people.length).to.equal(1);
                expect(pair.people[0].id).to.equal('vet-1');
            });
        });

        describe('checkMissingPerson', () => {
            it('should return false when pair has 2 people', () => {
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ type: 'Veteran', paired_with: 'guard-1' }));
                pair.addPerson(new AssignmentPerson({ type: 'Guardian', id: 'guard-1' }));
                const result = pair.checkMissingPerson();
                expect(result).to.equal(false);
                expect(pair.missingPerson).to.equal(false);
            });

            it('should return false when single person has empty paired_with', () => {
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ type: 'Veteran', paired_with: '' }));
                const result = pair.checkMissingPerson();
                expect(result).to.equal(false);
                expect(pair.missingPerson).to.equal(false);
            });

            it('should return true when single person has non-empty paired_with', () => {
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ type: 'Veteran', paired_with: 'guard-missing' }));
                const result = pair.checkMissingPerson();
                expect(result).to.equal(true);
                expect(pair.missingPerson).to.equal(true);
            });

            it('should return false when paired_with is only whitespace', () => {
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ type: 'Veteran', paired_with: '   ' }));
                const result = pair.checkMissingPerson();
                expect(result).to.equal(false);
                expect(pair.missingPerson).to.equal(false);
            });

            it('should handle empty people array', () => {
                const pair = new AssignmentPair();
                const result = pair.checkMissingPerson();
                expect(result).to.equal(false);
            });
        });

        describe('toJSON', () => {
            it('should convert pair with AssignmentPerson objects to JSON', () => {
                const pair = new AssignmentPair({
                    pairId: 'pair-1',
                    group: 'GroupX',
                    appDate: '2024-05-01',
                    missingPerson: false
                });
                pair.addPerson(new AssignmentPerson({ type: 'Veteran', id: 'v1' }));
                
                const json = pair.toJSON();
                expect(json.pairId).to.equal('pair-1');
                expect(json.group).to.equal('GroupX');
                expect(json.people.length).to.equal(1);
                expect(json.people[0].type).to.equal('Veteran');
            });

            it('should handle plain object people (non-AssignmentPerson)', () => {
                const pair = new AssignmentPair({
                    pairId: 'pair-2',
                    people: [{ type: 'Veteran', id: 'v2' }]
                });
                
                const json = pair.toJSON();
                expect(json.people[0]).to.deep.equal({ type: 'Veteran', id: 'v2' });
            });
        });
    });

    describe('FlightAssignment', () => {
        describe('constructor', () => {
            it('should create FlightAssignment with default values', () => {
                const assignment = new FlightAssignment();
                expect(assignment.flight.id).to.equal('');
                expect(assignment.flight.name).to.equal('');
                expect(assignment.flight.capacity).to.equal(0);
                expect(assignment.counts.veterans).to.equal(0);
                expect(assignment.counts.guardians).to.equal(0);
                expect(assignment.counts.remaining).to.equal(0);
                expect(assignment.pairs).to.deep.equal([]);
            });

            it('should create FlightAssignment from flight document properties', () => {
                const data = {
                    _id: 'flight-123',
                    _rev: '1-abc',
                    name: 'SSHF-Nov2024',
                    capacity: 100,
                    flight_date: '2024-11-05'
                };
                const assignment = new FlightAssignment(data);
                expect(assignment.flight.id).to.equal('flight-123');
                expect(assignment.flight.rev).to.equal('1-abc');
                expect(assignment.flight.name).to.equal('SSHF-Nov2024');
                expect(assignment.flight.capacity).to.equal(100);
            });

            it('should create FlightAssignment from nested flight object', () => {
                const data = {
                    flight: {
                        id: 'flight-456',
                        name: 'SSHF-Dec2024',
                        capacity: 200,
                        flight_date: '2024-12-05'
                    }
                };
                const assignment = new FlightAssignment(data);
                expect(assignment.flight.id).to.equal('flight-456');
                expect(assignment.flight.name).to.equal('SSHF-Dec2024');
            });

            it('should initialize counts from provided data', () => {
                const data = {
                    counts: {
                        veterans: 50,
                        guardians: 45,
                        veteransConfirmed: 40,
                        guardiansConfirmed: 38,
                        remaining: 5
                    }
                };
                const assignment = new FlightAssignment(data);
                expect(assignment.counts.veterans).to.equal(50);
                expect(assignment.counts.guardiansConfirmed).to.equal(38);
            });
        });

        describe('sortPairs', () => {
            it('should sort pairs by group then appDate descending', () => {
                const assignment = new FlightAssignment();
                assignment.pairs = [
                    new AssignmentPair({ pairId: '1', group: '', appDate: '2024-01-01' }),
                    new AssignmentPair({ pairId: '2', group: 'GroupA', appDate: '2024-01-15' }),
                    new AssignmentPair({ pairId: '3', group: 'GroupA', appDate: '2024-01-10' }),
                    new AssignmentPair({ pairId: '4', group: '', appDate: '2024-01-20' })
                ];
                
                assignment.sortPairs();
                
                // Sort is descending by (group || 'aa') + appDate
                // Since 'a' > 'G' in ASCII, non-grouped ('aa') come first
                // Within same group/non-group, newer dates come first
                expect(assignment.pairs[0].pairId).to.equal('4'); // no group (aa), 01-20
                expect(assignment.pairs[1].pairId).to.equal('1'); // no group (aa), 01-01
                expect(assignment.pairs[2].pairId).to.equal('2'); // GroupA, 01-15
                expect(assignment.pairs[3].pairId).to.equal('3'); // GroupA, 01-10
            });

            it('should handle empty pairs array', () => {
                const assignment = new FlightAssignment();
                expect(() => assignment.sortPairs()).to.not.throw();
            });
        });

        describe('calculateCounts', () => {
            it('should calculate counts from pairs', () => {
                const assignment = new FlightAssignment({ flight: { capacity: 100 } });
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ 
                    type: 'Veteran', 
                    id: 'vet-1', 
                    confirmed: '2024-01-01' 
                }));
                pair.addPerson(new AssignmentPerson({ 
                    type: 'Guardian', 
                    id: 'guard-1', 
                    confirmed: '' 
                }));
                assignment.pairs = [pair];
                
                assignment.calculateCounts();
                
                expect(assignment.counts.veterans).to.equal(1);
                expect(assignment.counts.guardians).to.equal(1);
                expect(assignment.counts.veteransConfirmed).to.equal(1);
                expect(assignment.counts.guardiansConfirmed).to.equal(0);
                expect(assignment.counts.remaining).to.equal(98);
            });

            it('should exclude nofly people from counts', () => {
                const assignment = new FlightAssignment({ flight: { capacity: 100 } });
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ 
                    type: 'Veteran', 
                    id: 'vet-1', 
                    nofly: true 
                }));
                pair.addPerson(new AssignmentPerson({ 
                    type: 'Veteran', 
                    id: 'vet-2', 
                    nofly: false 
                }));
                assignment.pairs = [pair];
                
                assignment.calculateCounts();
                
                expect(assignment.counts.veterans).to.equal(1);
                expect(assignment.counts.remaining).to.equal(99);
            });

            it('should handle duplicate IDs correctly (using Sets)', () => {
                const assignment = new FlightAssignment({ flight: { capacity: 100 } });
                // Same person appearing in multiple pairs (edge case)
                const pair1 = new AssignmentPair();
                pair1.addPerson(new AssignmentPerson({ type: 'Veteran', id: 'vet-1' }));
                const pair2 = new AssignmentPair();
                pair2.addPerson(new AssignmentPerson({ type: 'Veteran', id: 'vet-1' }));
                assignment.pairs = [pair1, pair2];
                
                assignment.calculateCounts();
                
                expect(assignment.counts.veterans).to.equal(1); // Deduplicated
            });

            it('should count confirmed guardians correctly', () => {
                const assignment = new FlightAssignment({ flight: { capacity: 100 } });
                const pair = new AssignmentPair();
                pair.addPerson(new AssignmentPerson({ 
                    type: 'Guardian', 
                    id: 'guard-1', 
                    confirmed: '2024-02-01' 
                }));
                pair.addPerson(new AssignmentPerson({ 
                    type: 'Guardian', 
                    id: 'guard-2', 
                    confirmed: '' 
                }));
                assignment.pairs = [pair];
                
                assignment.calculateCounts();
                
                expect(assignment.counts.guardians).to.equal(2);
                expect(assignment.counts.guardiansConfirmed).to.equal(1);
            });
        });

        describe('buildPairsFromViewResults', () => {
            it('should build pairs from view results', () => {
                const rows = [
                    { value: { pair: 'pair-1', type: 'Veteran', id: 'v1', group: 'G1', appdate: '2024-01-01' } },
                    { value: { pair: 'pair-1', type: 'Guardian', id: 'g1', group: 'G1', appdate: '2024-01-01' } },
                    { value: { pair: 'pair-2', type: 'Veteran', id: 'v2', group: '', appdate: '2024-01-15' } }
                ];
                
                const pairs = FlightAssignment.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(2);
                expect(pairs[0].pairId).to.equal('pair-1');
                expect(pairs[0].people.length).to.equal(2);
                expect(pairs[1].pairId).to.equal('pair-2');
                expect(pairs[1].people.length).to.equal(1);
            });

            it('should check for missing person in each pair', () => {
                const rows = [
                    { value: { pair: 'pair-1', type: 'Veteran', id: 'v1', paired_with: 'g1-missing' } }
                ];
                
                const pairs = FlightAssignment.buildPairsFromViewResults(rows);
                
                expect(pairs[0].missingPerson).to.equal(true);
            });

            it('should handle empty rows array', () => {
                const pairs = FlightAssignment.buildPairsFromViewResults([]);
                expect(pairs).to.deep.equal([]);
            });
        });

        describe('toJSON', () => {
            it('should convert assignment to JSON', () => {
                const assignment = new FlightAssignment({
                    flight: { id: 'f1', name: 'Test Flight', capacity: 50 },
                    counts: { veterans: 10, guardians: 8 }
                });
                assignment.pairs = [new AssignmentPair({ pairId: 'p1' })];
                
                const json = assignment.toJSON();
                
                expect(json).to.have.property('flight');
                expect(json).to.have.property('counts');
                expect(json).to.have.property('pairs');
                expect(json.flight.name).to.equal('Test Flight');
                expect(json.pairs.length).to.equal(1);
            });

            it('should handle plain object pairs (non-AssignmentPair)', () => {
                const assignment = new FlightAssignment();
                assignment.pairs = [{ pairId: 'plain', people: [] }];
                
                const json = assignment.toJSON();
                
                expect(json.pairs[0]).to.deep.equal({ pairId: 'plain', people: [] });
            });
        });

        describe('fromFlightDoc', () => {
            it('should create FlightAssignment from flight document', () => {
                const doc = {
                    _id: 'flight-abc',
                    _rev: '2-xyz',
                    name: 'SSHF-Spring2025',
                    capacity: 150,
                    flight_date: '2025-04-15'
                };
                
                const assignment = FlightAssignment.fromFlightDoc(doc);
                
                expect(assignment).to.be.instanceOf(FlightAssignment);
                expect(assignment.flight.id).to.equal('flight-abc');
                expect(assignment.flight.rev).to.equal('2-xyz');
                expect(assignment.flight.name).to.equal('SSHF-Spring2025');
                expect(assignment.flight.capacity).to.equal(150);
            });
        });
    });

    describe('AddVeteransResult', () => {
        describe('constructor', () => {
            it('should create result with zero counts and empty errors', () => {
                const result = new AddVeteransResult();
                expect(result.added.veterans).to.equal(0);
                expect(result.added.guardians).to.equal(0);
                expect(result.errors).to.deep.equal([]);
            });
        });

        describe('incrementVeterans', () => {
            it('should increment veteran count', () => {
                const result = new AddVeteransResult();
                result.incrementVeterans();
                result.incrementVeterans();
                expect(result.added.veterans).to.equal(2);
            });
        });

        describe('incrementGuardians', () => {
            it('should increment guardian count', () => {
                const result = new AddVeteransResult();
                result.incrementGuardians();
                expect(result.added.guardians).to.equal(1);
            });
        });

        describe('addError', () => {
            it('should add error to errors array', () => {
                const result = new AddVeteransResult();
                result.addError('Failed to save veteran');
                result.addError('Guardian not found');
                expect(result.errors.length).to.equal(2);
                expect(result.errors[0]).to.equal('Failed to save veteran');
            });
        });

        describe('toJSON', () => {
            it('should convert result to JSON', () => {
                const result = new AddVeteransResult();
                result.incrementVeterans();
                result.incrementGuardians();
                result.addError('Test error');
                
                const json = result.toJSON();
                
                expect(json).to.deep.equal({
                    added: { veterans: 1, guardians: 1 },
                    errors: ['Test error']
                });
            });
        });
    });
});

