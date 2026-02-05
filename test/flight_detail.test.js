import { expect } from 'chai';
import { 
    FlightDetailPerson, 
    FlightDetailPair, 
    FlightDetailStats,
    FlightDetailResult,
    VALID_BUSES
} from '../models/flight_detail.js';

describe('Flight Detail Models', () => {
    
    describe('VALID_BUSES', () => {
        it('should contain all expected bus values', () => {
            expect(VALID_BUSES).to.deep.equal([
                'None', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5',
                'Bravo1', 'Bravo2', 'Bravo3', 'Bravo4', 'Bravo5'
            ]);
        });
    });

    describe('FlightDetailPerson', () => {
        describe('constructor', () => {
            it('should create a FlightDetailPerson with default values', () => {
                const person = new FlightDetailPerson();
                expect(person.type).to.equal('');
                expect(person.id).to.equal('');
                expect(person.name_first).to.equal('');
                expect(person.name_last).to.equal('');
                expect(person.city).to.equal('');
                expect(person.bus).to.equal('None');
                expect(person.seat).to.equal('');
                expect(person.shirt).to.equal('');
                expect(person.nofly).to.equal(false);
                expect(person.confirmed).to.equal(false);
            });

            it('should create a Veteran with veteran-specific fields', () => {
                const data = {
                    type: 'Veteran',
                    id: 'vet-123',
                    name_first: 'John',
                    name_last: 'Smith',
                    city: 'Chicago, IL',
                    bus: 'Alpha3',
                    seat: '14A',
                    shirt: 'XL',
                    med_limits: '[3/3] wheelchair',
                    group: '583-2'
                };
                const person = new FlightDetailPerson(data);
                expect(person.type).to.equal('Veteran');
                expect(person.med_limits).to.equal('[3/3] wheelchair');
                expect(person.group).to.equal('583-2');
                expect(person).to.not.have.property('med_exprnc');
                expect(person).to.not.have.property('training');
            });

            it('should create a Guardian with guardian-specific fields', () => {
                const data = {
                    type: 'Guardian',
                    id: 'guard-456',
                    name_first: 'Jane',
                    name_last: 'Doe',
                    city: 'Milwaukee, WI',
                    bus: 'Bravo2',
                    seat: '7B',
                    shirt: 'L',
                    med_exprnc: 'Retired Nurse',
                    training: 'Main [A]',
                    training_complete: true
                };
                const person = new FlightDetailPerson(data);
                expect(person.type).to.equal('Guardian');
                expect(person.med_exprnc).to.equal('Retired Nurse');
                expect(person.training).to.equal('Main [A]');
                expect(person.training_complete).to.equal(true);
                expect(person).to.not.have.property('med_limits');
                expect(person).to.not.have.property('group');
            });

            it('should normalize invalid bus to None', () => {
                const person = new FlightDetailPerson({ bus: 'InvalidBus' });
                expect(person.bus).to.equal('None');
            });

            it('should normalize empty bus to None', () => {
                const person = new FlightDetailPerson({ bus: '' });
                expect(person.bus).to.equal('None');
            });

            it('should normalize null bus to None', () => {
                const person = new FlightDetailPerson({ bus: null });
                expect(person.bus).to.equal('None');
            });

            it('should accept valid bus values', () => {
                for (const bus of VALID_BUSES) {
                    const person = new FlightDetailPerson({ bus });
                    expect(person.bus).to.equal(bus);
                }
            });

            it('should parse nofly - string "nofly" treated as true', () => {
                const person = new FlightDetailPerson({ nofly: 'nofly' });
                expect(person.nofly).to.equal(true);
            });

            it('should parse nofly - empty string treated as false', () => {
                const person = new FlightDetailPerson({ nofly: '' });
                expect(person.nofly).to.equal(false);
            });

            it('should parse nofly - boolean true treated as true', () => {
                const person = new FlightDetailPerson({ nofly: true });
                expect(person.nofly).to.equal(true);
            });

            it('should parse confirmed - empty string treated as true (has confirmed_date)', () => {
                const person = new FlightDetailPerson({ confirmed: '' });
                expect(person.confirmed).to.equal(true);
            });

            it('should parse confirmed - "unconfirmed" treated as false', () => {
                const person = new FlightDetailPerson({ confirmed: 'unconfirmed' });
                expect(person.confirmed).to.equal(false);
            });

            it('should parse confirmed - string "confirmed" treated as true', () => {
                const person = new FlightDetailPerson({ confirmed: 'confirmed' });
                expect(person.confirmed).to.equal(true);
            });

            it('should parse confirmed - boolean true treated as true', () => {
                const person = new FlightDetailPerson({ confirmed: true });
                expect(person.confirmed).to.equal(true);
            });

            it('should parse training_complete - string "true" treated as true', () => {
                const person = new FlightDetailPerson({ type: 'Guardian', training_complete: 'true' });
                expect(person.training_complete).to.equal(true);
            });

            it('should parse training_complete - boolean true treated as true', () => {
                const person = new FlightDetailPerson({ type: 'Guardian', training_complete: true });
                expect(person.training_complete).to.equal(true);
            });

            it('should parse training_complete - other values treated as false', () => {
                const person = new FlightDetailPerson({ type: 'Guardian', training_complete: 'yes' });
                expect(person.training_complete).to.equal(false);
            });
        });

        describe('toJSON', () => {
            it('should return veteran properties in JSON format', () => {
                const person = new FlightDetailPerson({
                    type: 'Veteran',
                    id: 'vet-789',
                    name_first: 'Bob',
                    name_last: 'Jones',
                    city: 'Madison, WI',
                    bus: 'Alpha1',
                    seat: '5C',
                    shirt: 'M',
                    nofly: false,
                    confirmed: true,
                    med_limits: '[2/2]',
                    group: 'Group1'
                });
                const json = person.toJSON();
                expect(json).to.have.all.keys([
                    'type', 'id', 'name_first', 'name_last', 'city', 'bus', 'seat',
                    'shirt', 'nofly', 'confirmed', 'med_limits', 'group'
                ]);
                expect(json.type).to.equal('Veteran');
                expect(json.med_limits).to.equal('[2/2]');
            });

            it('should return guardian properties in JSON format', () => {
                const person = new FlightDetailPerson({
                    type: 'Guardian',
                    id: 'guard-abc',
                    name_first: 'Alice',
                    name_last: 'Brown',
                    med_exprnc: 'EMT',
                    training: 'Previous [B]',
                    training_complete: true
                });
                const json = person.toJSON();
                expect(json).to.have.all.keys([
                    'type', 'id', 'name_first', 'name_last', 'city', 'bus', 'seat',
                    'shirt', 'nofly', 'confirmed', 'med_exprnc', 'training', 'training_complete'
                ]);
                expect(json.type).to.equal('Guardian');
                expect(json.training_complete).to.equal(true);
            });
        });

        describe('fromViewRow', () => {
            it('should create FlightDetailPerson from view row data', () => {
                const row = {
                    type: 'Veteran',
                    id: 'vet-xyz',
                    name_first: 'Charlie',
                    name_last: 'Davis',
                    city: 'Green Bay, WI',
                    bus: 'Bravo4',
                    seat: '12D',
                    shirt: 'XL',
                    nofly: 'nofly',
                    confirmed: '',
                    med_limits: '[1/1]',
                    group: ''
                };
                const person = FlightDetailPerson.fromViewRow(row);
                expect(person).to.be.instanceOf(FlightDetailPerson);
                expect(person.type).to.equal('Veteran');
                expect(person.bus).to.equal('Bravo4');
                expect(person.nofly).to.equal(true);
                expect(person.confirmed).to.equal(true);
            });

            it('should handle missing properties with defaults', () => {
                const row = {};
                const person = FlightDetailPerson.fromViewRow(row);
                expect(person.type).to.equal('');
                expect(person.bus).to.equal('None');
                expect(person.nofly).to.equal(false);
            });

            it('should parse confirmed string "confirmed" from view row', () => {
                const row = {
                    type: 'Veteran',
                    id: 'vet-1',
                    confirmed: 'confirmed'
                };
                const person = FlightDetailPerson.fromViewRow(row);
                expect(person.confirmed).to.equal(true);
            });
        });
    });

    describe('FlightDetailPair', () => {
        describe('constructor', () => {
            it('should create a FlightDetailPair with default values', () => {
                const pair = new FlightDetailPair();
                expect(pair.pairId).to.equal('');
                expect(pair.busMismatch).to.equal(false);
                expect(pair.missingPairedPerson).to.equal(false);
                expect(pair.people).to.deep.equal([]);
            });

            it('should create a FlightDetailPair with provided values', () => {
                const data = {
                    pairId: 'pair-123',
                    busMismatch: true,
                    missingPairedPerson: false,
                    people: [new FlightDetailPerson({ type: 'Veteran' })]
                };
                const pair = new FlightDetailPair(data);
                expect(pair.pairId).to.equal('pair-123');
                expect(pair.busMismatch).to.equal(true);
                expect(pair.people.length).to.equal(1);
            });

            it('should parse busMismatch boolean - string "true" treated as true', () => {
                const pair = new FlightDetailPair({ busMismatch: 'true' });
                expect(pair.busMismatch).to.equal(true);
            });

            it('should parse missingPairedPerson boolean correctly', () => {
                const pair = new FlightDetailPair({ missingPairedPerson: true });
                expect(pair.missingPairedPerson).to.equal(true);
            });
        });

        describe('addPerson', () => {
            it('should add a person to the pair', () => {
                const pair = new FlightDetailPair();
                const person = new FlightDetailPerson({ type: 'Veteran', id: 'vet-1' });
                pair.addPerson(person);
                expect(pair.people.length).to.equal(1);
                expect(pair.people[0].id).to.equal('vet-1');
            });
        });

        describe('checkBusMismatch', () => {
            it('should return false when pair has only 1 person', () => {
                const pair = new FlightDetailPair();
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', bus: 'Alpha1' }));
                const result = pair.checkBusMismatch();
                expect(result).to.equal(false);
                expect(pair.busMismatch).to.equal(false);
            });

            it('should return false when all people have same bus', () => {
                const pair = new FlightDetailPair();
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', bus: 'Alpha3' }));
                pair.addPerson(new FlightDetailPerson({ type: 'Guardian', bus: 'Alpha3' }));
                const result = pair.checkBusMismatch();
                expect(result).to.equal(false);
                expect(pair.busMismatch).to.equal(false);
            });

            it('should return true when people have different buses', () => {
                const pair = new FlightDetailPair();
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', bus: 'Alpha3' }));
                pair.addPerson(new FlightDetailPerson({ type: 'Guardian', bus: 'Bravo2' }));
                const result = pair.checkBusMismatch();
                expect(result).to.equal(true);
                expect(pair.busMismatch).to.equal(true);
            });

            it('should handle empty people array', () => {
                const pair = new FlightDetailPair();
                const result = pair.checkBusMismatch();
                expect(result).to.equal(false);
            });
        });

        describe('toJSON', () => {
            it('should convert pair with FlightDetailPerson objects to JSON', () => {
                const pair = new FlightDetailPair({
                    pairId: 'pair-1',
                    busMismatch: false,
                    missingPairedPerson: false
                });
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v1', bus: 'Alpha1' }));
                
                const json = pair.toJSON();
                expect(json.pairId).to.equal('pair-1');
                expect(json.busMismatch).to.equal(false);
                expect(json.missingPairedPerson).to.equal(false);
                expect(json.people.length).to.equal(1);
                expect(json.people[0].type).to.equal('Veteran');
            });

            it('should handle plain object people (non-FlightDetailPerson)', () => {
                const pair = new FlightDetailPair({
                    pairId: 'pair-2',
                    people: [{ type: 'Veteran', id: 'v2' }]
                });
                
                const json = pair.toJSON();
                expect(json.people[0]).to.deep.equal({ type: 'Veteran', id: 'v2' });
            });
        });
    });

    describe('FlightDetailStats', () => {
        describe('constructor', () => {
            it('should create FlightDetailStats with zero counts', () => {
                const stats = new FlightDetailStats();
                
                // Check buses
                expect(stats.buses.None).to.equal(0);
                expect(stats.buses.Alpha1).to.equal(0);
                expect(stats.buses.Bravo5).to.equal(0);
                
                // Check tours
                expect(stats.tours.Alpha).to.equal(0);
                expect(stats.tours.Bravo).to.equal(0);
                expect(stats.tours.None).to.equal(0);
                
                // Check flight
                expect(stats.flight.Alpha).to.equal(0);
                expect(stats.flight.Bravo).to.equal(0);
                expect(stats.flight.None).to.equal(0);
            });
        });

        describe('toJSON', () => {
            it('should return all properties in JSON format', () => {
                const stats = new FlightDetailStats();
                stats.buses.Alpha1 = 10;
                stats.tours.Alpha = 50;
                stats.flight.Alpha = 48;
                
                const json = stats.toJSON();
                expect(json).to.have.all.keys(['buses', 'tours', 'flight']);
                expect(json.buses.Alpha1).to.equal(10);
                expect(json.tours.Alpha).to.equal(50);
                expect(json.flight.Alpha).to.equal(48);
            });

            it('should return copies of objects (not references)', () => {
                const stats = new FlightDetailStats();
                const json = stats.toJSON();
                json.buses.Alpha1 = 999;
                expect(stats.buses.Alpha1).to.equal(0);
            });
        });
    });

    describe('FlightDetailResult', () => {
        describe('constructor', () => {
            it('should create FlightDetailResult with default values', () => {
                const result = new FlightDetailResult();
                expect(result.flight.id).to.equal('');
                expect(result.flight.name).to.equal('');
                expect(result.flight.capacity).to.equal(0);
                expect(result.stats).to.be.instanceOf(FlightDetailStats);
                expect(result.pairs).to.deep.equal([]);
            });

            it('should create FlightDetailResult from flight document properties', () => {
                const data = {
                    _id: 'flight-123',
                    name: 'SSHF-Nov2024',
                    capacity: 100,
                    flight_date: '2024-11-05'
                };
                const result = new FlightDetailResult(data);
                expect(result.flight.id).to.equal('flight-123');
                expect(result.flight.name).to.equal('SSHF-Nov2024');
                expect(result.flight.capacity).to.equal(100);
            });

            it('should create FlightDetailResult from nested flight object', () => {
                const data = {
                    flight: {
                        id: 'flight-456',
                        name: 'SSHF-Dec2024',
                        capacity: 200,
                        flight_date: '2024-12-05'
                    }
                };
                const result = new FlightDetailResult(data);
                expect(result.flight.id).to.equal('flight-456');
                expect(result.flight.name).to.equal('SSHF-Dec2024');
            });

            it('should use provided FlightDetailStats instance', () => {
                const stats = new FlightDetailStats();
                stats.buses.Alpha1 = 5;
                const data = {
                    flight: { id: 'f1', name: 'Test' },
                    stats: stats
                };
                const result = new FlightDetailResult(data);
                expect(result.stats).to.equal(stats);  // Same instance
                expect(result.stats.buses.Alpha1).to.equal(5);
            });
        });

        describe('calculateStats', () => {
            it('should calculate bus counts', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                const pair = new FlightDetailPair();
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v1', bus: 'Alpha1' }));
                pair.addPerson(new FlightDetailPerson({ type: 'Guardian', id: 'g1', bus: 'Alpha1' }));
                result.pairs = [pair];
                
                result.calculateStats();
                
                expect(result.stats.buses.Alpha1).to.equal(2);
                expect(result.stats.buses.None).to.equal(0);
            });

            it('should calculate tour counts', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                const pair1 = new FlightDetailPair();
                pair1.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v1', bus: 'Alpha1' }));
                pair1.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v2', bus: 'Alpha3' }));
                const pair2 = new FlightDetailPair();
                pair2.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v3', bus: 'Bravo2' }));
                result.pairs = [pair1, pair2];
                
                result.calculateStats();
                
                expect(result.stats.tours.Alpha).to.equal(2);
                expect(result.stats.tours.Bravo).to.equal(1);
            });

            it('should calculate flight counts excluding nofly', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                const pair = new FlightDetailPair();
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v1', bus: 'Alpha1', nofly: false }));
                pair.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v2', bus: 'Alpha1', nofly: true }));
                result.pairs = [pair];
                
                result.calculateStats();
                
                expect(result.stats.tours.Alpha).to.equal(2);  // Both counted in tours
                expect(result.stats.flight.Alpha).to.equal(1);  // Only non-nofly counted in flight
            });

            it('should deduplicate people by ID', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                // Same person appearing in multiple pairs
                const pair1 = new FlightDetailPair();
                pair1.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v1', bus: 'Alpha1' }));
                const pair2 = new FlightDetailPair();
                pair2.addPerson(new FlightDetailPerson({ type: 'Veteran', id: 'v1', bus: 'Alpha1' }));
                result.pairs = [pair1, pair2];
                
                result.calculateStats();
                
                expect(result.stats.buses.Alpha1).to.equal(1);  // Deduplicated
            });

            it('should handle empty pairs array', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                result.pairs = [];
                
                expect(() => result.calculateStats()).to.not.throw();
                expect(result.stats.tours.Alpha).to.equal(0);
            });

            it('should handle person with undefined bus (defaults to None)', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                const pair = new FlightDetailPair();
                const person = new FlightDetailPerson({ type: 'Veteran', id: 'v1' });
                person.bus = undefined;  // Explicitly set to undefined
                pair.addPerson(person);
                result.pairs = [pair];
                
                result.calculateStats();
                
                expect(result.stats.buses.None).to.equal(1);
            });

            it('should handle person with null bus (defaults to None)', () => {
                const result = new FlightDetailResult({ flight: { capacity: 100 } });
                const pair = new FlightDetailPair();
                const person = new FlightDetailPerson({ type: 'Veteran', id: 'v1' });
                person.bus = null;  // Explicitly set to null
                pair.addPerson(person);
                result.pairs = [pair];
                
                result.calculateStats();
                
                expect(result.stats.buses.None).to.equal(1);
            });
        });

        describe('buildPairsFromViewResults', () => {
            it('should use guardian ID as pairId when veteran is paired', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(1);
                expect(pairs[0].pairId).to.equal('g1');  // Guardian ID as pairId
                expect(pairs[0].people.length).to.equal(2);
            });

            it('should use veteran ID as pairId for unpaired veteran', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(1);
                expect(pairs[0].pairId).to.equal('v1');  // Veteran ID as pairId (unpaired)
                expect(pairs[0].people.length).to.equal(1);
            });

            it('should group multiple veterans with same guardian', () => {
                // Guardian g1 is paired with v1 and v2
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(1);  // One group for guardian g1
                expect(pairs[0].pairId).to.equal('g1');
                expect(pairs[0].people.length).to.equal(3);  // 2 veterans + 1 guardian
                
                const veteranCount = pairs[0].people.filter(p => p.type === 'Veteran').length;
                const guardianCount = pairs[0].people.filter(p => p.type === 'Guardian').length;
                expect(veteranCount).to.equal(2);
                expect(guardianCount).to.equal(1);
            });

            it('should detect bus mismatch across whole group', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Bravo2', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs[0].busMismatch).to.equal(true);  // v2 is on different bus
            });

            it('should detect missing paired person - veteran missing guardian', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g-missing' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs[0].pairId).to.equal('v1');  // Unpaired veteran
                expect(pairs[0].missingPairedPerson).to.equal(true);
            });

            it('should detect missing paired person - guardian missing veteran', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'g1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v-missing' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs[0].pairId).to.equal('g1');  // Guardian ID
                expect(pairs[0].missingPairedPerson).to.equal(true);
            });

            it('should not flag missingPairedPerson when paired person is present', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs[0].missingPairedPerson).to.equal(false);
            });

            it('should deduplicate guardians when view returns duplicates', () => {
                // Guardian g1 is paired with v1 and v2 - view returns g1 twice with different pairing values
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } },
                    { key: ['SSHF-Nov2024', 'v2', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v2' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(1);
                expect(pairs[0].people.length).to.equal(3);  // 2 veterans + 1 guardian (deduplicated)
                
                const guardianCount = pairs[0].people.filter(p => p.type === 'Guardian').length;
                expect(guardianCount).to.equal(1);
            });

            it('should handle empty rows array', () => {
                const pairs = FlightDetailResult.buildPairsFromViewResults([]);
                expect(pairs).to.deep.equal([]);
            });

            it('should not flag missingPairedPerson for empty pairing', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: '' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs[0].pairId).to.equal('v1');  // Unpaired veteran
                expect(pairs[0].missingPairedPerson).to.equal(false);
            });

            it('should handle guardian on flight with no veterans paired to them', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'g1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(1);
                expect(pairs[0].pairId).to.equal('g1');
                expect(pairs[0].people.length).to.equal(1);
            });

            it('should create separate groups for different guardians', () => {
                const rows = [
                    { key: ['SSHF-Nov2024', 'v1', 0], value: { type: 'Veteran', id: 'v1', bus: 'Alpha1', pairing: 'g1' } },
                    { key: ['SSHF-Nov2024', 'v1', 1], value: { type: 'Guardian', id: 'g1', bus: 'Alpha1', pairing: 'v1' } },
                    { key: ['SSHF-Nov2024', 'v2', 0], value: { type: 'Veteran', id: 'v2', bus: 'Bravo2', pairing: 'g2' } },
                    { key: ['SSHF-Nov2024', 'v2', 1], value: { type: 'Guardian', id: 'g2', bus: 'Bravo2', pairing: 'v2' } }
                ];
                
                const pairs = FlightDetailResult.buildPairsFromViewResults(rows);
                
                expect(pairs.length).to.equal(2);
                const pairIds = pairs.map(p => p.pairId);
                expect(pairIds).to.include('g1');
                expect(pairIds).to.include('g2');
            });
        });

        describe('toJSON', () => {
            it('should convert result to JSON', () => {
                const result = new FlightDetailResult({
                    flight: { id: 'f1', name: 'Test Flight', capacity: 50 }
                });
                result.pairs = [new FlightDetailPair({ pairId: 'p1' })];
                
                const json = result.toJSON();
                
                expect(json).to.have.property('flight');
                expect(json).to.have.property('stats');
                expect(json).to.have.property('pairs');
                expect(json.flight.name).to.equal('Test Flight');
                expect(json.pairs.length).to.equal(1);
            });

            it('should handle plain object pairs (non-FlightDetailPair)', () => {
                const result = new FlightDetailResult();
                result.pairs = [{ pairId: 'plain', people: [] }];
                
                const json = result.toJSON();
                
                expect(json.pairs[0]).to.deep.equal({ pairId: 'plain', people: [] });
            });

            it('should convert stats to JSON', () => {
                const result = new FlightDetailResult();
                result.stats.buses.Alpha1 = 5;
                
                const json = result.toJSON();
                
                expect(json.stats.buses.Alpha1).to.equal(5);
            });

            it('should handle stats that is not a FlightDetailStats instance', () => {
                const result = new FlightDetailResult();
                result.stats = { buses: { Alpha1: 10 }, tours: { Alpha: 10 }, flight: { Alpha: 10 } };
                
                const json = result.toJSON();
                
                expect(json.stats).to.deep.equal(result.stats);
            });
        });

        describe('fromFlightDoc', () => {
            it('should create FlightDetailResult from flight document', () => {
                const doc = {
                    _id: 'flight-abc',
                    name: 'SSHF-Spring2025',
                    capacity: 150,
                    flight_date: '2025-04-15'
                };
                
                const result = FlightDetailResult.fromFlightDoc(doc);
                
                expect(result).to.be.instanceOf(FlightDetailResult);
                expect(result.flight.id).to.equal('flight-abc');
                expect(result.flight.name).to.equal('SSHF-Spring2025');
                expect(result.flight.capacity).to.equal(150);
                expect(result.stats).to.be.instanceOf(FlightDetailStats);
            });
        });
    });
});
