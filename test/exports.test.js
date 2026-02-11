import { expect } from 'chai';
import sinon from 'sinon';
import {
    exportFlightCsv,
    exportCallCenterFollowUpCsv,
    exportTourLeadCsv
} from '../routes/exports.js';

describe('Exports Route Handlers', () => {
    let req;
    let res;

    beforeEach(() => {
        req = {
            query: {
                flightName: 'SSHF-Apr2026'
            },
            dbCookie: 'AuthSession=test-cookie'
        };

        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy(),
            setHeader: sinon.spy(),
            send: sinon.spy()
        };

        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('exportFlightCsv', () => {
        it('returns 400 when flightName is missing', async () => {
            req.query = {};

            await exportFlightCsv(req, res);

            expect(res.status.calledOnceWith(400)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('flightName parameter is required');
        });

        it('returns 400 when filter is invalid', async () => {
            req.query.filter = 'InvalidFilter';

            await exportFlightCsv(req, res);

            expect(res.status.calledOnceWith(400)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('filter must be one of: All, Veterans, Guardians');
        });

        it('exports CSV with default All filter', async () => {
            const csv = '"flight_id","type"\n"SSHF-Apr2026","Veteran"\n';
            global.fetch.resolves({
                ok: true,
                status: 200,
                text: async () => csv
            });

            await exportFlightCsv(req, res);

            expect(global.fetch.calledOnce).to.be.true;
            const url = global.fetch.firstCall.args[0];
            expect(url).to.include('/_design/basic/_list/flight-csv/active_by_flight?');
            expect(url).to.include('startkey=%5B%22SSHF-Apr2026%22%2C%22a%22%5D');
            expect(url).to.include('endkey=%5B%22SSHF-Apr2026%22%2C%22Z%22%5D');
            expect(url).to.include('include_docs=true');

            const options = global.fetch.firstCall.args[1];
            expect(options.headers.Accept).to.equal('text/csv');
            expect(options.headers.Cookie).to.equal('AuthSession=test-cookie');

            expect(res.setHeader.calledWith('Content-Type', 'text/csv')).to.be.true;
            expect(res.setHeader.calledWith('Content-Disposition', 'attachment; filename="FlightInfo.csv"')).to.be.true;
            expect(res.send.calledOnceWith(csv)).to.be.true;
        });

        it('exports CSV with Veterans filter', async () => {
            global.fetch.resolves({
                ok: true,
                status: 200,
                text: async () => 'csv'
            });
            req.query.filter = 'Veterans';

            await exportFlightCsv(req, res);

            const url = global.fetch.firstCall.args[0];
            expect(url).to.include('startkey=%5B%22SSHF-Apr2026%22%2C%22Veteran%22%5D');
            expect(url).to.include('endkey=%5B%22SSHF-Apr2026%22%2C%22Veteran%22%5D');
        });

        it('returns 500 when CouchDB responds with reason', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'couch failure' })
            });

            await exportFlightCsv(req, res);

            expect(res.status.calledOnceWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('couch failure');
        });

        it('returns fallback error when CouchDB error body has no reason/error', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({})
            });

            await exportFlightCsv(req, res);

            expect(res.status.calledOnceWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to retrieve flight export');
        });

        it('returns 503 when db session cannot be established', async () => {
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            await exportFlightCsv(req, res);

            expect(res.status.calledOnceWith(503)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });
    });

    describe('exportCallCenterFollowUpCsv', () => {
        it('exports CSV when flightName is provided', async () => {
            req.query = { flightName: 'SSHF-Test01' };
            global.fetch.resolves({
                ok: true,
                status: 200,
                text: async () => 'csv'
            });

            await exportCallCenterFollowUpCsv(req, res);

            const url = global.fetch.firstCall.args[0];
            expect(url).to.include('/_design/basic/_list/callcenterfollowup-csv/active_by_flight?');
            expect(url).to.include('startkey=%5B%22SSHF-Test01%22%2C%22a%22%5D');
            expect(url).to.include('endkey=%5B%22SSHF-Test01%22%2C%22Z%22%5D');
            expect(res.setHeader.calledWith('Content-Disposition', 'attachment; filename="CallCenterFollowUp.csv"')).to.be.true;
            expect(res.send.calledOnceWith('csv')).to.be.true;
        });

        it('returns 400 when flightName is missing', async () => {
            req.query = {};

            await exportCallCenterFollowUpCsv(req, res);

            expect(res.status.calledOnceWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('flightName parameter is required');
        });
    });

    describe('exportTourLeadCsv', () => {
        it('returns 400 when flightName is missing', async () => {
            req.query = {};

            await exportTourLeadCsv(req, res);

            expect(res.status.calledOnceWith(400)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('flightName parameter is required');
        });

        it('exports CSV with flight_pairings params and descending=false', async () => {
            global.fetch.resolves({
                ok: true,
                status: 200,
                text: async () => 'tour-csv'
            });

            await exportTourLeadCsv(req, res);

            const url = global.fetch.firstCall.args[0];
            expect(url).to.include('/_design/basic/_list/tourlead-csv/flight_pairings?');
            expect(url).to.include('startkey=%5B%22SSHF-Apr2026%22%5D');
            expect(url).to.include('endkey=%5B%22SSHF-Apr2026Z%22%5D');
            expect(url).to.include('include_docs=true');
            expect(url).to.include('descending=false');
            expect(res.setHeader.calledWith('Content-Disposition', 'attachment; filename="TourLead.csv"')).to.be.true;
            expect(res.send.calledOnceWith('tour-csv')).to.be.true;
        });

        it('returns fallback error message when non-OK response is not JSON', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('not json');
                }
            });

            await exportTourLeadCsv(req, res);

            expect(res.status.calledOnceWith(500)).to.be.true;
            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Failed to retrieve tour lead export');
        });
    });
});
