import { expect } from 'chai';
import { UnpairedVeteranRequest } from '../models/unpaired_veteran_request.js';

describe('UnpairedVeteranRequest', () => {
    describe('constructor', () => {
        it('should use default values when no data provided', () => {
            const request = new UnpairedVeteranRequest();
            expect(request.paired).to.equal(false);
            expect(request.status).to.equal('Active');
            expect(request.lastname).to.equal('');
            expect(request.limit).to.equal(25);
        });

        it('should use provided values', () => {
            const data = {
                paired: false,
                status: 'Flown',
                lastname: 'Smith',
                limit: 50
            };
            const request = new UnpairedVeteranRequest(data);
            expect(request.paired).to.equal(false);
            expect(request.status).to.equal('Flown');
            expect(request.lastname).to.equal('Smith');
            expect(request.limit).to.equal(50);
        });

        it('should handle paired as boolean true', () => {
            const request = new UnpairedVeteranRequest({ paired: true });
            expect(request.paired).to.equal(true);
        });

        it('should handle paired as string "true"', () => {
            const request = new UnpairedVeteranRequest({ paired: 'true' });
            expect(request.paired).to.equal(true);
        });

        it('should handle paired as boolean false', () => {
            const request = new UnpairedVeteranRequest({ paired: false });
            expect(request.paired).to.equal(false);
        });

        it('should handle paired as string "false"', () => {
            const request = new UnpairedVeteranRequest({ paired: 'false' });
            expect(request.paired).to.equal(false);
        });

        it('should handle undefined paired as false', () => {
            const request = new UnpairedVeteranRequest({});
            expect(request.paired).to.equal(false);
        });

        it('should handle empty string status and use default', () => {
            const request = new UnpairedVeteranRequest({ status: '' });
            expect(request.status).to.equal('Active');
        });

        it('should handle empty string lastname', () => {
            const request = new UnpairedVeteranRequest({ lastname: '' });
            expect(request.lastname).to.equal('');
        });

        it('should handle zero limit', () => {
            const request = new UnpairedVeteranRequest({ limit: 0 });
            expect(request.limit).to.equal(0);
        });

        it('should handle undefined limit and use default', () => {
            const request = new UnpairedVeteranRequest({});
            expect(request.limit).to.equal(25);
        });
    });

    describe('getViewName', () => {
        it('should return null when paired is true', () => {
            const request = new UnpairedVeteranRequest({ paired: true });
            expect(request.getViewName()).to.be.null;
        });

        it('should return null when paired is string "true"', () => {
            const request = new UnpairedVeteranRequest({ paired: 'true' });
            expect(request.getViewName()).to.be.null;
        });

        it('should return unpaired_veterans_by_last_name when paired is false', () => {
            const request = new UnpairedVeteranRequest({ paired: false });
            expect(request.getViewName()).to.equal('unpaired_veterans_by_last_name');
        });

        it('should return unpaired_veterans_by_last_name when paired is undefined', () => {
            const request = new UnpairedVeteranRequest({});
            expect(request.getViewName()).to.equal('unpaired_veterans_by_last_name');
        });
    });

    describe('toQueryParams', () => {
        it('should generate correct params with status and lastname', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: 'Smith',
                limit: 25
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["Active","SMITH"]');
            expect(params.get('endkey')).to.equal('["Active","SMITH\ufff0"]');
            expect(params.get('limit')).to.equal('25');
        });

        it('should uppercase lastname in query params', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Flown',
                lastname: 'smith'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["Flown","SMITH"]');
            expect(params.get('endkey')).to.equal('["Flown","SMITH\ufff0"]');
        });

        it('should handle mixed case lastname', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: 'SmItH'
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["Active","SMITH"]');
        });

        it('should handle empty lastname', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: ''
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('startkey')).to.equal('["Active",""]');
            expect(params.get('endkey')).to.equal('["Active","\ufff0"]');
        });

        it('should include limit in params', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: 'Smith',
                limit: 50
            });
            const params = new URLSearchParams(request.toQueryParams());
            expect(params.get('limit')).to.equal('50');
        });

        it('should handle zero limit', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: 'Smith',
                limit: 0
            });
            const params = new URLSearchParams(request.toQueryParams());
            // URLSearchParams will convert 0 to "0", but the if check should prevent it
            // Actually, looking at the code, if(this.limit) will be false for 0
            // So limit won't be included
            expect(params.get('limit')).to.be.null;
        });

        it('should handle different status values', () => {
            const statuses = ['Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction'];
            
            statuses.forEach(status => {
                const request = new UnpairedVeteranRequest({
                    status: status,
                    lastname: 'Smith'
                });
                const params = new URLSearchParams(request.toQueryParams());
                expect(params.get('startkey')).to.equal(`["${status}","SMITH"]`);
                expect(params.get('endkey')).to.equal(`["${status}","SMITH\ufff0"]`);
            });
        });

        it('should generate correct endkey with lastname concatenated with unicode character', () => {
            const request = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: 'Smith'
            });
            const params = new URLSearchParams(request.toQueryParams());
            const endKey = params.get('endkey');
            expect(endKey).to.equal('["Active","SMITH\ufff0"]');
        });

        it('should uppercase spaced last names and keep the spaces in startkey and endkey', () => {
            const cases = [
                {
                    label: 'Le Roy',
                    startkey: '["Active","LE ROY"]',
                    endkey: '["Active","LE ROY\ufff0"]'
                },
                {
                    label: 'le roy',
                    startkey: '["Active","LE ROY"]',
                    endkey: '["Active","LE ROY\ufff0"]'
                },
                {
                    label: 'LE ROY',
                    startkey: '["Active","LE ROY"]',
                    endkey: '["Active","LE ROY\ufff0"]'
                }
            ];

            cases.forEach(({ label, startkey, endkey }) => {
                const request = new UnpairedVeteranRequest({
                    status: 'Active',
                    lastname: label
                });
                const params = new URLSearchParams(request.toQueryParams());
                expect(params.get('startkey'), label).to.equal(startkey);
                expect(params.get('endkey'), label).to.equal(endkey);
                expect(request.lastname, label).to.equal(label);
            });
        });

        it('should keep an unspaced last name on a different key from the spaced form', () => {
            const cases = [
                { label: 'LeRoy', startkey: '["Active","LEROY"]', endkey: '["Active","LEROY\ufff0"]' },
                { label: 'leroy', startkey: '["Active","LEROY"]', endkey: '["Active","LEROY\ufff0"]' }
            ];

            cases.forEach(({ label, startkey, endkey }) => {
                const request = new UnpairedVeteranRequest({
                    status: 'Active',
                    lastname: label
                });
                const params = new URLSearchParams(request.toQueryParams());
                expect(params.get('startkey'), label).to.equal(startkey);
                expect(params.get('endkey'), label).to.equal(endkey);
                expect(params.get('startkey'), label).to.not.equal('["Active","LE ROY"]');
            });
        });

        it('should uppercase apostrophes, periods, and hyphens without removing them', () => {
            const obrien = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: "O'Brien"
            });
            expect(new URLSearchParams(obrien.toQueryParams()).get('startkey')).to.equal('["Active","O\'BRIEN"]');
            expect(new URLSearchParams(obrien.toQueryParams()).get('endkey')).to.equal('["Active","O\'BRIEN\ufff0"]');

            const stJohn = new UnpairedVeteranRequest({
                status: 'Flown',
                lastname: 'St. John'
            });
            expect(new URLSearchParams(stJohn.toQueryParams()).get('startkey')).to.equal('["Flown","ST. JOHN"]');
            expect(new URLSearchParams(stJohn.toQueryParams()).get('endkey')).to.equal('["Flown","ST. JOHN\ufff0"]');

            const hyphenated = new UnpairedVeteranRequest({
                status: 'Active',
                lastname: 'Smith-Jones'
            });
            expect(new URLSearchParams(hyphenated.toQueryParams()).get('startkey')).to.equal('["Active","SMITH-JONES"]');
            expect(new URLSearchParams(hyphenated.toQueryParams()).get('endkey')).to.equal('["Active","SMITH-JONES\ufff0"]');
        });
    });

    describe('toJSON', () => {
        it('should return correct JSON representation with paired false', () => {
            const request = new UnpairedVeteranRequest({
                paired: false,
                status: 'Active',
                lastname: 'Smith',
                limit: 50
            });
            
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                paired: false,
                status: 'Active',
                lastname: 'Smith',
                limit: 50,
                viewName: 'unpaired_veterans_by_last_name'
            });
        });

        it('should return correct JSON representation with paired true', () => {
            const request = new UnpairedVeteranRequest({
                paired: true,
                status: 'Flown',
                lastname: 'Jones',
                limit: 25
            });
            
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                paired: true,
                status: 'Flown',
                lastname: 'Jones',
                limit: 25,
                viewName: null
            });
        });

        it('should keep the typed lastname when only the index key is uppercased', () => {
            const request = new UnpairedVeteranRequest({
                lastname: 'Le Roy',
                status: 'Active'
            });

            expect(request.toJSON().lastname).to.equal('Le Roy');
        });

        it('should return correct JSON representation with defaults', () => {
            const request = new UnpairedVeteranRequest();
            
            const json = request.toJSON();
            
            expect(json).to.deep.equal({
                paired: false,
                status: 'Active',
                lastname: '',
                limit: 25,
                viewName: 'unpaired_veterans_by_last_name'
            });
        });
    });
});

