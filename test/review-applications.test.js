import { expect } from 'chai';
import sinon from 'sinon';
import {
    createReviewApplication,
    listReviewApplications,
    retrieveReviewApplication,
    updateReviewApplication,
    updateReviewApplicationStatus,
    acceptReviewApplication
} from '../routes/review-applications.js';
import { clearSessionCache, clearReviewSessionCache } from '../utils/db.js';

function buildVeteranAppFixture(overrides = {}) {
    return JSON.parse(JSON.stringify({
        _id: 'app-1',
        _rev: '3-xyz',
        type: 'VeteranApp',
        date_time: '2024-03-05 14:22:01',
        ip_address: '203.0.113.9',
        'First-Name': 'John',
        'Middle-Name': 'Q',
        'Last-Name': 'Public',
        Nickname: 'Jack',
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
        some_unknown_key: 'kept',
        ...overrides
    }));
}

function buildGuardianAppFixture(overrides = {}) {
    const base = buildVeteranAppFixture(overrides);
    base.type = 'GuardianApp';
    delete base.Conflict;
    delete base['Branch-of-Service'];
    delete base['Service-Dates'];
    delete base.Rank;
    delete base['medical-wheelchair'];
    delete base['medical-oxygen'];
    delete base['Guardian-Preference'];
    delete base['Preferred-Guardian-Phone-Number'];
    delete base['Preferred-Guardian-Email'];
    base['Veteran-Preference'] = 'Father John Public';
    return base;
}

function buildVeteranIntakePayload(overrides = {}) {
    return {
        type: 'VeteranApp',
        cburi: 'http://legacy-couch/db',
        cbusr: 'legacy-user',
        cbpwd: 'legacy-pass',
        full_message: 'raw intake message',
        'First-Name': 'John',
        'Middle-Name': 'Q',
        'Last-Name': 'Public',
        Nickname: 'Jack',
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
        ...overrides
    };
}

function buildGuardianIntakePayload(overrides = {}) {
    const base = buildVeteranIntakePayload(overrides);
    base.type = 'GuardianApp';
    delete base.Conflict;
    delete base['Branch-of-Service'];
    delete base['Service-Dates'];
    delete base.Rank;
    delete base['medical-wheelchair'];
    delete base['medical-oxygen'];
    delete base['Guardian-Preference'];
    delete base['Preferred-Guardian-Phone-Number'];
    delete base['Preferred-Guardian-Email'];
    base['Veteran-Preference'] = 'Father John Public';
    return base;
}

function buildValidUpdateBody(overrides = {}) {
    return {
        name: { first: 'Johnny', last: 'Public' },
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
        app_status: 'Hold',
        app_status_note: 'call back',
        gender: 'M',
        birth_date: '1948-05-17',
        vet_type: 'Korea',
        service: { branch: 'Navy' },
        medical: { usesWheelchair: false, requiresOxygen: true },
        ...overrides
    };
}

function getPutCalls() {
    return global.fetch.getCalls().filter((call) => call.args[1]?.method === 'PUT');
}

describe('Review Applications Route Handlers', () => {
    let req, res;
    const originalEnv = {};

    before(() => {
        ['DB_URL', 'DB_NAME', 'REVIEW_DB_URL', 'REVIEW_DB_NAME'].forEach((key) => {
            originalEnv[key] = process.env[key];
        });
        process.env.DB_URL = 'http://main:5984';
        process.env.DB_NAME = 'hf';
        process.env.REVIEW_DB_URL = 'http://review:5984';
        process.env.REVIEW_DB_NAME = 'hf_apps';
    });

    after(() => {
        Object.entries(originalEnv).forEach(([key, value]) => {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    });

    beforeEach(() => {
        clearSessionCache();
        clearReviewSessionCache();

        req = {
            params: { id: 'app-1' },
            query: {},
            body: {},
            user: { firstName: 'Admin', lastName: 'User' },
            dbCookie: 'AuthSession=main',
            reviewDbCookie: 'AuthSession=review'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('createReviewApplication', () => {
        it('should create a VeteranApp from intake payload with stripped keys', async () => {
            req.body = buildVeteranIntakePayload();

            let savedBody = null;
            global.fetch.callsFake(async (url, options) => {
                expect(url).to.equal('http://review:5984/hf_apps');
                expect(options.method).to.equal('POST');
                expect(options.headers['Content-Type']).to.equal('application/json');
                expect(options.headers.Cookie).to.equal('AuthSession=review');
                savedBody = JSON.parse(options.body);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'new-id', rev: '1-abc' })
                };
            });

            await createReviewApplication(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            expect(savedBody.type).to.equal('VeteranApp');
            expect(savedBody.app_status).to.equal('New');
            expect(savedBody['First-Name']).to.equal('John');
            expect(savedBody.metadata.created_by).to.equal('Online App');
            expect(savedBody).to.not.have.property('cburi');
            expect(savedBody).to.not.have.property('cbusr');
            expect(savedBody).to.not.have.property('cbpwd');
            expect(savedBody).to.not.have.property('full_message');

            expect(res.status.calledWith(201)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._id).to.equal('new-id');
            expect(response._rev).to.equal('1-abc');
            expect(response.app_status).to.equal('New');
            expect(response.name.first).to.equal('John');
            expect(response.address.state).to.equal('WI');
        });

        it('should create a GuardianApp from intake payload', async () => {
            req.body = buildGuardianIntakePayload();

            let savedBody = null;
            global.fetch.callsFake(async (url, options) => {
                expect(url).to.equal('http://review:5984/hf_apps');
                expect(options.method).to.equal('POST');
                savedBody = JSON.parse(options.body);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'new-id', rev: '1-abc' })
                };
            });

            await createReviewApplication(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            expect(savedBody.type).to.equal('GuardianApp');
            expect(savedBody['Veteran-Preference']).to.equal('Father John Public');
            expect(res.status.calledWith(201)).to.be.true;
            expect(res.json.firstCall.args[0]._id).to.equal('new-id');
        });

        it('should return 400 when type is Veteran', async () => {
            req.body = buildVeteranIntakePayload({ type: 'Veteran' });

            await createReviewApplication(req, res);

            expect(global.fetch.called).to.be.false;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal(
                'Application type must be VeteranApp or GuardianApp'
            );
        });

        it('should return 400 when type is missing', async () => {
            req.body = buildVeteranIntakePayload();
            delete req.body.type;

            await createReviewApplication(req, res);

            expect(global.fetch.called).to.be.false;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal(
                'Application type must be VeteranApp or GuardianApp'
            );
        });

        it('should create a sparse VeteranApp intake payload with missing fields', async () => {
            req.body = {
                type: 'VeteranApp',
                'First-Name': 'John'
            };

            let savedBody = null;
            global.fetch.callsFake(async (url, options) => {
                expect(url).to.equal('http://review:5984/hf_apps');
                expect(options.method).to.equal('POST');
                savedBody = JSON.parse(options.body);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'sparse-id', rev: '1-abc' })
                };
            });

            await createReviewApplication(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            expect(savedBody.type).to.equal('VeteranApp');
            expect(savedBody.app_status).to.equal('New');
            expect(savedBody['First-Name']).to.equal('John');
            expect(savedBody['Last-Name']).to.equal('');
            expect(savedBody.County).to.equal('');

            expect(res.status.calledWith(201)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._id).to.equal('sparse-id');
            expect(response.name.first).to.equal('John');
            expect(response.name.last).to.equal('');
            expect(response.address.county).to.equal('');
        });

        it('should return 503 when review database session is exhausted', async () => {
            req.body = buildVeteranIntakePayload();
            global.fetch.resolves({ ok: false, status: 401 });

            await createReviewApplication(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include(
                'Database session could not be established'
            );
        });

        it('should return 500 when review database POST fails', async () => {
            req.body = buildVeteranIntakePayload();
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'boom' })
            });

            await createReviewApplication(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('boom');
        });
    });

    describe('listReviewApplications', () => {
        const viewRow = {
            id: 'app-1',
            key: ['New', '2024-03-05 14:22:01'],
            value: {
                type: 'VeteranApp',
                appdate: '2024-03-05T14:22:01.000Z',
                app_status: 'New',
                name: 'John Public',
                city: 'Madison',
                pairing: '',
                email: 'john@example.com',
                ipaddr: '203.0.113.9'
            }
        };

        it('should list applications with default status and limit', async () => {
            global.fetch.callsFake(async (url) => {
                expect(url).to.include('/hf_apps/_design/hf-app-review/_view/new_apps');
                expect(url).to.include(
                    `startkey=${encodeURIComponent(JSON.stringify(['New', '9']))}`
                );
                expect(url).to.include(
                    `endkey=${encodeURIComponent(JSON.stringify(['New', '0']))}`
                );
                expect(url).to.include('descending=true');
                expect(url).to.include('limit=25');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        total_rows: 1,
                        offset: 0,
                        rows: [viewRow]
                    })
                };
            });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.total_rows).to.equal(1);
            expect(response.offset).to.equal(0);
            expect(response.rows).to.deep.equal([{
                id: 'app-1',
                type: 'VeteranApp',
                name: 'John Public',
                city: 'Madison',
                app_date: '2024-03-05',
                app_status: 'New',
                pairing: '',
                email: 'john@example.com',
                ip_address: '203.0.113.9'
            }]);
        });

        it('should reflect status Hold and limit 50 in the view URL', async () => {
            req.query = { status: 'Hold', limit: '50' };

            global.fetch.callsFake(async (url) => {
                expect(url).to.include(
                    `startkey=${encodeURIComponent(JSON.stringify(['Hold', '9']))}`
                );
                expect(url).to.include(
                    `endkey=${encodeURIComponent(JSON.stringify(['Hold', '0']))}`
                );
                expect(url).to.include('limit=50');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ total_rows: 0, offset: 0, rows: [] })
                };
            });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should cap limit 9999 to 500', async () => {
            req.query = { limit: '9999' };

            global.fetch.callsFake(async (url) => {
                expect(url).to.include('limit=500');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ total_rows: 0, offset: 0, rows: [] })
                };
            });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should treat limit 0 as 1', async () => {
            req.query = { limit: '0' };

            global.fetch.callsFake(async (url) => {
                expect(url).to.include('limit=1');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ total_rows: 0, offset: 0, rows: [] })
                };
            });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should default invalid limit abc to 25', async () => {
            req.query = { limit: 'abc' };

            global.fetch.callsFake(async (url) => {
                expect(url).to.include('limit=25');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ total_rows: 0, offset: 0, rows: [] })
                };
            });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should return 400 for invalid application status', async () => {
            req.query = { status: 'Bogus' };

            await listReviewApplications(req, res);

            expect(global.fetch.called).to.be.false;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid application status');
        });

        it('should return 500 when view fetch is not ok', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'view error' })
            });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(500)).to.be.true;
        });

        it('should return 503 when review database session is exhausted', async () => {
            global.fetch.resolves({ ok: false, status: 401 });

            await listReviewApplications(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include(
                'Database session could not be established'
            );
        });
    });

    describe('retrieveReviewApplication', () => {
        it('should return normalized VeteranApp payload', async () => {
            const doc = buildVeteranAppFixture();

            global.fetch.callsFake(async (url, options) => {
                expect(url).to.equal('http://review:5984/hf_apps/app-1');
                expect(options.headers.Cookie).to.equal('AuthSession=review');
                return { ok: true, status: 200, json: async () => doc };
            });

            await retrieveReviewApplication(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.name.first).to.equal('John');
            expect(response.address.phone_day).to.equal('608-555-1234');
            expect(response.birth_date).to.equal('1948-05-17');
            expect(response.gender).to.equal('M');
            expect(response.vet_type).to.equal('Vietnam');
            expect(response.medical.usesWheelchair).to.equal(true);
            expect(response.accepted_as_rev).to.equal('');
            expect(response.app_date).to.equal('2024-03-05');
        });

        it('should return normalized GuardianApp payload with veteran.pref_notes', async () => {
            const doc = buildGuardianAppFixture();

            global.fetch.resolves({
                ok: true,
                status: 200,
                json: async () => doc
            });

            await retrieveReviewApplication(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            expect(res.json.firstCall.args[0].veteran.pref_notes).to.equal('Father John Public');
        });

        it('should return 404 when application is not found', async () => {
            global.fetch.resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await retrieveReviewApplication(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Application not found');
        });

        it('should return 400 when document is not a review application', async () => {
            global.fetch.resolves({
                ok: true,
                status: 200,
                json: async () => ({ _id: 'app-1', type: 'Veteran' })
            });

            await retrieveReviewApplication(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Document is not a review application');
        });

        it('should return 503 when review database session is exhausted', async () => {
            global.fetch.resolves({ ok: false, status: 401 });

            await retrieveReviewApplication(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include(
                'Database session could not be established'
            );
        });
    });

    describe('updateReviewApplication', () => {
        it('should update an existing VeteranApp with legacy field mapping', async () => {
            const existingDoc = buildVeteranAppFixture();
            req.body = buildValidUpdateBody();

            let putBody = null;
            global.fetch
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => existingDoc })
                .onSecondCall().callsFake(async (url, options) => {
                    expect(url).to.equal('http://review:5984/hf_apps/app-1');
                    putBody = JSON.parse(options.body);
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '4-new' })
                    };
                });

            await updateReviewApplication(req, res);

            expect(putBody['First-Name']).to.equal('Johnny');
            expect(putBody.Conflict).to.equal('Korea');
            expect(putBody['Branch-of-Service']).to.equal('Navy');
            expect(putBody['medical-wheelchair']).to.equal('No');
            expect(putBody['medical-oxygen']).to.equal('Yes');
            expect(putBody.app_status).to.equal('Hold');
            expect(putBody._rev).to.equal('3-xyz');
            expect(putBody.date_time).to.equal('2024-03-05 14:22:01');
            expect(putBody.ip_address).to.equal('203.0.113.9');
            expect(putBody.some_unknown_key).to.equal('kept');
            expect(putBody.metadata.created_by).to.equal('Online App');
            expect(putBody.metadata.updated_by).to.equal('Admin User');

            expect(res.status.calledWith(200)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response._rev).to.equal('4-new');
            expect(response.app_status).to.equal('Hold');
        });

        it('should keep existing app_status when body omits app_status', async () => {
            const existingDoc = buildVeteranAppFixture({ app_status: 'Hold' });
            req.body = buildValidUpdateBody();
            delete req.body.app_status;

            global.fetch
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => existingDoc })
                .onSecondCall().callsFake(async (url, options) => {
                    const putBody = JSON.parse(options.body);
                    expect(putBody.app_status).to.equal('Hold');
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '4-new' })
                    };
                });

            await updateReviewApplication(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            expect(res.json.firstCall.args[0].app_status).to.equal('Hold');
        });

        it('should return 400 when attempting to accept via update endpoint', async () => {
            const existingDoc = buildVeteranAppFixture({ app_status: 'New' });
            req.body = buildValidUpdateBody({ app_status: 'Accepted' });

            global.fetch.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => existingDoc
            });

            await updateReviewApplication(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal(
                'Use the accept endpoint to accept an application'
            );
        });

        it('should allow update when application is already Accepted', async () => {
            const existingDoc = buildVeteranAppFixture({ app_status: 'Accepted' });
            req.body = buildValidUpdateBody({ app_status: 'Accepted' });

            global.fetch
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => existingDoc })
                .onSecondCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'app-1', rev: '4-new' })
                });

            await updateReviewApplication(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            expect(res.json.firstCall.args[0].app_status).to.equal('Accepted');
        });

        it('should return 400 for invalid gender without PUT', async () => {
            const existingDoc = buildVeteranAppFixture();
            req.body = buildValidUpdateBody({ gender: 'X' });

            global.fetch.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => existingDoc
            });

            await updateReviewApplication(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
        });

        it('should return 404 when application is not found', async () => {
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateReviewApplication(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Application not found');
        });

        it('should return 400 when document is not a review application', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ _id: 'app-1', type: 'Veteran' })
            });

            await updateReviewApplication(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Document is not a review application');
        });

        it('should return 500 when PUT is not ok', async () => {
            const existingDoc = buildVeteranAppFixture();
            req.body = buildValidUpdateBody();

            global.fetch
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => existingDoc })
                .onSecondCall().resolves({
                    ok: false,
                    status: 500,
                    json: async () => ({ reason: 'update failed' })
                });

            await updateReviewApplication(req, res);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('update failed');
        });

        it('should return 503 when review database session is exhausted', async () => {
            req.body = buildValidUpdateBody();
            global.fetch.resolves({ ok: false, status: 401 });

            await updateReviewApplication(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include(
                'Database session could not be established'
            );
        });
    });

    describe('updateReviewApplicationStatus', () => {
        it('should update application status and note', async () => {
            const existingDoc = buildVeteranAppFixture();
            req.body = { app_status: 'Rejected', app_status_note: 'Not eligible' };

            let putBody = null;
            global.fetch
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => existingDoc })
                .onSecondCall().callsFake(async (url, options) => {
                    putBody = JSON.parse(options.body);
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '4-new' })
                    };
                });

            await updateReviewApplicationStatus(req, res);

            expect(putBody.app_status).to.equal('Rejected');
            expect(putBody.app_status_note).to.equal('Not eligible');
            expect(putBody['First-Name']).to.equal('John');
            expect(res.status.calledWith(200)).to.be.true;
            expect(res.json.firstCall.args[0].app_status).to.equal('Rejected');
        });

        it('should preserve existing note when app_status_note is omitted', async () => {
            const existingDoc = buildVeteranAppFixture({ app_status_note: 'Existing note' });
            req.body = { app_status: 'Rejected' };

            global.fetch
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => existingDoc })
                .onSecondCall().callsFake(async (url, options) => {
                    const putBody = JSON.parse(options.body);
                    expect(putBody.app_status_note).to.equal('Existing note');
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '4-new' })
                    };
                });

            await updateReviewApplicationStatus(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            expect(res.json.firstCall.args[0].app_status_note).to.equal('Existing note');
        });

        it('should return 400 when app_status is missing', async () => {
            req.body = {};

            await updateReviewApplicationStatus(req, res);

            expect(global.fetch.called).to.be.false;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid application status');
        });

        it('should return 400 for bogus application status', async () => {
            req.body = { app_status: 'Bogus' };

            await updateReviewApplicationStatus(req, res);

            expect(global.fetch.called).to.be.false;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid application status');
        });

        it('should return 400 when attempting to accept via status endpoint', async () => {
            req.body = { app_status: 'Accepted' };

            await updateReviewApplicationStatus(req, res);

            expect(global.fetch.called).to.be.false;
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal(
                'Use the accept endpoint to accept an application'
            );
        });

        it('should return 404 when application is not found', async () => {
            req.body = { app_status: 'Rejected' };
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            });

            await updateReviewApplicationStatus(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Application not found');
        });

        it('should return 503 when review database session is exhausted', async () => {
            req.body = { app_status: 'Rejected' };
            global.fetch.resolves({ ok: false, status: 401 });

            await updateReviewApplicationStatus(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include(
                'Database session could not be established'
            );
        });
    });

    describe('acceptReviewApplication', () => {
        it('should accept a new VeteranApp into the main database', async () => {
            const reviewDoc = buildVeteranAppFixture();
            let mainPutBody = null;
            let reviewPutBody = null;

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc })
                .onSecondCall().callsFake(async (url, options) => {
                    reviewPutBody = JSON.parse(options.body);
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '4-rev' })
                    };
                });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                })
                .onSecondCall().callsFake(async (url, options) => {
                    expect(url).to.equal('http://main:5984/hf/app-1');
                    expect(options.headers.Cookie).to.equal('AuthSession=main');
                    mainPutBody = JSON.parse(options.body);
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '1-main' })
                    };
                });

            await acceptReviewApplication(req, res);

            expect(mainPutBody.type).to.equal('Veteran');
            expect(mainPutBody._id).to.equal('app-1');
            expect(mainPutBody).to.not.have.property('_rev');
            expect(mainPutBody.name.first).to.equal('John');
            expect(mainPutBody.address.state).to.equal('WI');
            expect(mainPutBody.address.phone_day).to.equal('608-555-1234');
            expect(mainPutBody.vet_type).to.equal('Vietnam');
            expect(mainPutBody.service.branch).to.equal('Army');
            expect(mainPutBody.medical.usesWheelchair).to.equal(true);
            expect(mainPutBody.flight.status).to.equal('Active');
            expect(mainPutBody.guardian.pref_notes).to.equal(
                'Son Bob (Phone: 608-555-0000, Email: bob@example.com)'
            );
            expect(mainPutBody.metadata.created_by).to.equal('Online App (Admin User)');
            expect(mainPutBody.metadata.updated_by).to.equal('Admin User');

            expect(reviewPutBody.app_status).to.equal('Accepted');
            expect(reviewPutBody.acceptedAsRev).to.equal('1-main');
            expect(reviewPutBody['First-Name']).to.equal('John');
            expect(reviewPutBody.metadata.updated_by).to.equal('Admin User');

            expect(res.status.calledWith(200)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.application.app_status).to.equal('Accepted');
            expect(response.application.accepted_as_rev).to.equal('1-main');
            expect(response.application._rev).to.equal('4-rev');
            expect(response.record.type).to.equal('Veteran');
            expect(response.record._rev).to.equal('1-main');
        });

        it('should accept a new GuardianApp into the main database', async () => {
            const reviewDoc = buildGuardianAppFixture();

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc })
                .onSecondCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'app-1', rev: '4-rev' })
                });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                })
                .onSecondCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'app-1', rev: '1-main' })
                });

            await acceptReviewApplication(req, res);

            expect(res.status.calledWith(200)).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.record.type).to.equal('Guardian');
            expect(response.record.veteran.pref_notes).to.equal('Father John Public');
        });

        it('should include optional app_status_note on review PUT', async () => {
            const reviewDoc = buildVeteranAppFixture();
            req.body = { app_status_note: 'Welcome' };
            let reviewPutBody = null;

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc })
                .onSecondCall().callsFake(async (url, options) => {
                    reviewPutBody = JSON.parse(options.body);
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '4-rev' })
                    };
                });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                })
                .onSecondCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'app-1', rev: '1-main' })
                });

            await acceptReviewApplication(req, res);

            expect(reviewPutBody.app_status_note).to.equal('Welcome');
            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should re-accept when main record revision matches acceptedAsRev', async () => {
            const reviewDoc = buildVeteranAppFixture({
                app_status: 'Accepted',
                acceptedAsRev: '1-main'
            });
            const existingMainDoc = {
                _id: 'app-1',
                _rev: '1-main',
                type: 'Veteran',
                name: { first: 'Old', middle: '', last: 'Public', nickname: '' },
                address: {
                    street: '123 Main St',
                    city: 'Madison',
                    county: 'Dane',
                    state: 'WI',
                    zip: '53703',
                    phone_day: '608-555-1234',
                    phone_mbl: '',
                    email: 'john@example.com'
                },
                flight: { id: 'SSHF-Nov2024', status: 'Active' },
                metadata: { created_by: 'Someone', created_at: '2020-01-01T00:00:00Z' }
            };
            let mainPutBody = null;

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc })
                .onSecondCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ id: 'app-1', rev: '4-rev' })
                });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => existingMainDoc
                })
                .onSecondCall().callsFake(async (url, options) => {
                    mainPutBody = JSON.parse(options.body);
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'app-1', rev: '1-main' })
                    };
                });

            await acceptReviewApplication(req, res);

            expect(mainPutBody._rev).to.equal('1-main');
            expect(mainPutBody.flight.id).to.equal('SSHF-Nov2024');
            expect(mainPutBody.name.first).to.equal('John');
            expect(res.status.calledWith(200)).to.be.true;
        });

        it('should return 409 when main record revision changed since acceptance', async () => {
            const reviewDoc = buildVeteranAppFixture({
                app_status: 'Accepted',
                acceptedAsRev: '1-main'
            });

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ _id: 'app-1', _rev: '2-changed', type: 'Veteran' })
                });

            await acceptReviewApplication(req, res);

            expect(getPutCalls()).to.have.lengthOf(0);
            expect(res.status.calledWith(409)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal(
                'Application was already copied and has since been modified in the logistics database'
            );
        });

        it('should return 400 when review doc fails validation before any PUT', async () => {
            const reviewDoc = buildVeteranAppFixture();
            delete reviewDoc.County;

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                });

            await acceptReviewApplication(req, res);

            expect(getPutCalls()).to.have.lengthOf(0);
            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Validation failed');
        });

        it('should return 404 when review application is not found', async () => {
            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                });

            await acceptReviewApplication(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Application not found');
        });

        it('should return 400 when review document is not a review application', async () => {
            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({
                    ok: true,
                    status: 200,
                    json: async () => ({ _id: 'app-1', type: 'Veteran' })
                });

            await acceptReviewApplication(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Document is not a review application');
        });

        it('should return 500 when main PUT fails and not update review doc', async () => {
            const reviewDoc = buildVeteranAppFixture();

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .onFirstCall().resolves({
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found' })
                })
                .onSecondCall().resolves({
                    ok: false,
                    status: 500,
                    json: async () => ({ reason: 'conflict' })
                });

            await acceptReviewApplication(req, res);

            const reviewPutCalls = getPutCalls().filter((call) =>
                call.args[0].includes('http://review:5984')
            );
            expect(reviewPutCalls).to.have.lengthOf(0);
            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('conflict');
        });

        it('should return 503 when main database session is exhausted', async () => {
            const reviewDoc = buildVeteranAppFixture();

            global.fetch.withArgs(sinon.match('http://review:5984/hf_apps/app-1'))
                .onFirstCall().resolves({ ok: true, status: 200, json: async () => reviewDoc });

            global.fetch.withArgs(sinon.match('http://main:5984/hf/app-1'))
                .resolves({ ok: false, status: 401 });

            await acceptReviewApplication(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include(
                'Database session could not be established'
            );
        });
    });
});
