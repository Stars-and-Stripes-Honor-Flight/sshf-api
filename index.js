import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { specs } from './swagger/swagger.js';
import { swaggerUiServe, swaggerUiSetup } from './swagger/swagger-ui.js';
import { dbSession, reviewDbSession } from './utils/db.js';
import { buildCorsOptions } from './utils/cors.js';
import { authenticateIntake } from './utils/intake_auth.js';
import { requirePermission, assertGroupAuthorizationConfigured } from './utils/auth.js';
import { ensureAuthorizationGroupsExist, resolveAuthorizationGroups } from './utils/groups.js';
import { ROUTE_PERMISSIONS, listConfiguredGroupEntries, startupWarnings } from './utils/permissions.js';
import { createMembershipCache } from './utils/membership_cache.js';
import { createUserCache } from './utils/user_cache.js';
import { createAuthenticator } from './utils/authenticate.js';
import { isDirectRun } from './utils/direct_run.js';

// Import route handlers
import { getUserPermissions } from './routes/user.js';
import { getSearch } from './routes/search.js';
import { postQuery } from './routes/query.js';
import { createDocument, retrieveDocument, updateDocument, deleteDocument, listDocumentRevisions, diffDocument } from './routes/docs.js';
import {
    createVeteran,
    retrieveVeteran,
    updateVeteran,
    deleteVeteran,
    searchUnpairedVeterans,
    updateVeteranSeat,
    updateVeteranBus,
    updateVeteranMailCallReceived,
    updateVeteranMailCallAdopt,
    updateVeteranMedicalForm,
    updateVeteranMedicalReview,
    updateVeteranVaccinated,
    updateVeteranHomecomingDestination,
    updateVeteranApparelShirtSize,
    updateVeteranApparelJacketSize,
    updateVeteranApparelNotes
} from './routes/veterans.js';
import {
    createGuardian,
    retrieveGuardian,
    updateGuardian,
    deleteGuardian,
    updateGuardianSeat,
    updateGuardianBus,
    updateGuardianTrainingNotes,
    updateGuardianTrainingComplete,
    updateGuardianWaiver,
    updateGuardianTrainingSeeDoc,
    updateGuardianVaccinated,
    updateGuardianMedicalForm,
    updateGuardianPaid,
    updateGuardianBooksOrdered,
    updateGuardianApparelShirtSize,
    updateGuardianApparelJacketSize,
    updateGuardianApparelNotes
} from './routes/guardians.js';
import { listFlights, createFlight, retrieveFlight, updateFlight } from './routes/flights.js';
import { getFlightAssignments, addVeteransToFlight } from './routes/flight-assignments.js';
import { completeFlight, activateFutureStatus } from './routes/flight-status.js';
import { getFlightDetail } from './routes/flight-detail.js';
import { getWaitlist } from './routes/waitlist.js';
import { getWaitlistVeteranGroups } from './routes/waitlist-veteran-groups.js';
import { getRecentActivity } from './routes/recent-activity.js';
import { exportFlightCsv, exportCallCenterFollowUpCsv, exportTourLeadCsv } from './routes/exports.js';
import {
    createReviewApplication,
    listReviewApplications,
    retrieveReviewApplication,
    updateReviewApplication,
    updateReviewApplicationStatus,
    acceptReviewApplication
} from './routes/review-applications.js';

const app = express();
const port = 8080;

// Enable CORS for all routes with specific options
app.use(cors(buildCorsOptions()));

// Successful authentications are cached for up to 15 minutes (see utils/user_cache.js).
// A negative group membership shortens that entry to about 2 minutes. Keys are
// SHA-256 hashes of the bearer token, expired entries are swept on access, and
// the map is capped at USER_CACHE_MAX_ENTRIES.
const userCache = createUserCache();
const membershipCache = createMembershipCache();

/**
 * Resolve direct or nested membership in every configured AUTHZ_ROLE_*_GROUPS
 * email with members.hasMember. The membership cache is per process and is
 * not a substitute for the token-keyed sign-in cache.
 */
export function resolveRequestGroupMemberships(userData) {
    const entries = listConfiguredGroupEntries();
    const groupEnvVars = {};
    for (const entry of entries) {
        groupEnvVars[entry.email] = entry.envVar;
    }
    return resolveAuthorizationGroups(
        userData,
        entries.map((entry) => entry.email),
        { membershipCache, groupEnvVars }
    );
}

// Client used only to introspect incoming access tokens (validate audience)
const tokenInfoClient = new OAuth2Client();

export async function getUserInfo(token) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userResponse = await oauth2.userinfo.get();
    if (!userResponse.data) {
        throw new Error('Failed to fetch user info');
    }
    return userResponse.data;
}

// Middleware to authenticate Google users. On Cloud Run, Directory outages
// return 503 (see utils/authenticate.js) and are not cached as an empty role
// list. Local runs continue with no roles when Directory credentials fail.
// Configured role groups are checked with members.hasMember so nested members
// are resolved. Protected routes then require the permission in
// ROUTE_PERMISSIONS. GET /user/permissions stays auth-only.
const authenticate = createAuthenticator({
    getTokenInfo: (token) => tokenInfoClient.getTokenInfo(token),
    getUserInfo,
    getGroupMemberships: resolveRequestGroupMemberships,
    cache: userCache
});

function requireRoutePermission(method, path) {
    const permissions = ROUTE_PERMISSIONS[`${method} ${path}`];
    if (!permissions || permissions.length === 0) {
        throw new Error(`ROUTE_PERMISSIONS has no entry for ${method} ${path}`);
    }
    return requirePermission(...permissions);
}

// Route definitions
app.get('/user/permissions', authenticate, getUserPermissions);
app.get("/search", authenticate, requireRoutePermission('GET', '/search'), dbSession, getSearch);
app.use(express.json()); // for parsing application/json
app.post("/query", authenticate, requireRoutePermission('POST', '/query'), dbSession, postQuery);

// Generic document routes
app.get("/docs/:id/revisions", authenticate, requireRoutePermission('GET', '/docs/:id/revisions'), dbSession, listDocumentRevisions);
app.get("/docs/:id/diff", authenticate, requireRoutePermission('GET', '/docs/:id/diff'), dbSession, diffDocument);
app.post("/docs", authenticate, requireRoutePermission('POST', '/docs'), dbSession, createDocument);
app.get("/docs/:id", authenticate, requireRoutePermission('GET', '/docs/:id'), dbSession, retrieveDocument);
app.put("/docs/:id", authenticate, requireRoutePermission('PUT', '/docs/:id'), dbSession, updateDocument);
app.delete("/docs/:id", authenticate, requireRoutePermission('DELETE', '/docs/:id'), dbSession, deleteDocument);

// Veteran-specific routes
app.post("/veterans", authenticate, requireRoutePermission('POST', '/veterans'), dbSession, createVeteran);
app.get("/veterans/search", authenticate, requireRoutePermission('GET', '/veterans/search'), dbSession, searchUnpairedVeterans);
app.get("/veterans/:id", authenticate, requireRoutePermission('GET', '/veterans/:id'), dbSession, retrieveVeteran);
app.put("/veterans/:id", authenticate, requireRoutePermission('PUT', '/veterans/:id'), dbSession, updateVeteran);
app.patch("/veterans/:id/seat", authenticate, requireRoutePermission('PATCH', '/veterans/:id/seat'), dbSession, updateVeteranSeat);
app.patch("/veterans/:id/bus", authenticate, requireRoutePermission('PATCH', '/veterans/:id/bus'), dbSession, updateVeteranBus);
app.patch("/veterans/:id/mail-call-received", authenticate, requireRoutePermission('PATCH', '/veterans/:id/mail-call-received'), dbSession, updateVeteranMailCallReceived);
app.patch("/veterans/:id/mail-call-adopt", authenticate, requireRoutePermission('PATCH', '/veterans/:id/mail-call-adopt'), dbSession, updateVeteranMailCallAdopt);
app.patch("/veterans/:id/medical-form", authenticate, requireRoutePermission('PATCH', '/veterans/:id/medical-form'), dbSession, updateVeteranMedicalForm);
app.patch("/veterans/:id/medical-review", authenticate, requireRoutePermission('PATCH', '/veterans/:id/medical-review'), dbSession, updateVeteranMedicalReview);
app.patch("/veterans/:id/vaccinated", authenticate, requireRoutePermission('PATCH', '/veterans/:id/vaccinated'), dbSession, updateVeteranVaccinated);
app.patch("/veterans/:id/homecoming-destination", authenticate, requireRoutePermission('PATCH', '/veterans/:id/homecoming-destination'), dbSession, updateVeteranHomecomingDestination);
app.patch("/veterans/:id/apparel-shirt-size", authenticate, requireRoutePermission('PATCH', '/veterans/:id/apparel-shirt-size'), dbSession, updateVeteranApparelShirtSize);
app.patch("/veterans/:id/apparel-jacket-size", authenticate, requireRoutePermission('PATCH', '/veterans/:id/apparel-jacket-size'), dbSession, updateVeteranApparelJacketSize);
app.patch("/veterans/:id/apparel-notes", authenticate, requireRoutePermission('PATCH', '/veterans/:id/apparel-notes'), dbSession, updateVeteranApparelNotes);
app.delete("/veterans/:id", authenticate, requireRoutePermission('DELETE', '/veterans/:id'), dbSession, deleteVeteran);

// Guardian-specific routes
app.post("/guardians", authenticate, requireRoutePermission('POST', '/guardians'), dbSession, createGuardian);
app.get("/guardians/:id", authenticate, requireRoutePermission('GET', '/guardians/:id'), dbSession, retrieveGuardian);
app.put("/guardians/:id", authenticate, requireRoutePermission('PUT', '/guardians/:id'), dbSession, updateGuardian);
app.patch("/guardians/:id/seat", authenticate, requireRoutePermission('PATCH', '/guardians/:id/seat'), dbSession, updateGuardianSeat);
app.patch("/guardians/:id/bus", authenticate, requireRoutePermission('PATCH', '/guardians/:id/bus'), dbSession, updateGuardianBus);
app.patch("/guardians/:id/training-notes", authenticate, requireRoutePermission('PATCH', '/guardians/:id/training-notes'), dbSession, updateGuardianTrainingNotes);
app.patch("/guardians/:id/training-complete", authenticate, requireRoutePermission('PATCH', '/guardians/:id/training-complete'), dbSession, updateGuardianTrainingComplete);
app.patch("/guardians/:id/waiver", authenticate, requireRoutePermission('PATCH', '/guardians/:id/waiver'), dbSession, updateGuardianWaiver);
app.patch("/guardians/:id/training-see-doc", authenticate, requireRoutePermission('PATCH', '/guardians/:id/training-see-doc'), dbSession, updateGuardianTrainingSeeDoc);
app.patch("/guardians/:id/vaccinated", authenticate, requireRoutePermission('PATCH', '/guardians/:id/vaccinated'), dbSession, updateGuardianVaccinated);
app.patch("/guardians/:id/medical-form", authenticate, requireRoutePermission('PATCH', '/guardians/:id/medical-form'), dbSession, updateGuardianMedicalForm);
app.patch("/guardians/:id/paid", authenticate, requireRoutePermission('PATCH', '/guardians/:id/paid'), dbSession, updateGuardianPaid);
app.patch("/guardians/:id/books-ordered", authenticate, requireRoutePermission('PATCH', '/guardians/:id/books-ordered'), dbSession, updateGuardianBooksOrdered);
app.patch("/guardians/:id/apparel-shirt-size", authenticate, requireRoutePermission('PATCH', '/guardians/:id/apparel-shirt-size'), dbSession, updateGuardianApparelShirtSize);
app.patch("/guardians/:id/apparel-jacket-size", authenticate, requireRoutePermission('PATCH', '/guardians/:id/apparel-jacket-size'), dbSession, updateGuardianApparelJacketSize);
app.patch("/guardians/:id/apparel-notes", authenticate, requireRoutePermission('PATCH', '/guardians/:id/apparel-notes'), dbSession, updateGuardianApparelNotes);
app.delete("/guardians/:id", authenticate, requireRoutePermission('DELETE', '/guardians/:id'), dbSession, deleteGuardian);

// Flight-specific routes
app.get("/flights", authenticate, requireRoutePermission('GET', '/flights'), dbSession, listFlights);
app.post("/flights", authenticate, requireRoutePermission('POST', '/flights'), dbSession, createFlight);
app.get("/flights/:id", authenticate, requireRoutePermission('GET', '/flights/:id'), dbSession, retrieveFlight);
app.put("/flights/:id", authenticate, requireRoutePermission('PUT', '/flights/:id'), dbSession, updateFlight);
app.post("/flights/:id/complete", authenticate, requireRoutePermission('POST', '/flights/:id/complete'), dbSession, completeFlight);
app.post("/flights/future-status/activate", authenticate, requireRoutePermission('POST', '/flights/future-status/activate'), dbSession, activateFutureStatus);

// Flight assignment routes
app.get("/flights/:id/assignments", authenticate, requireRoutePermission('GET', '/flights/:id/assignments'), dbSession, getFlightAssignments);
app.post("/flights/:id/assignments", authenticate, requireRoutePermission('POST', '/flights/:id/assignments'), dbSession, addVeteransToFlight);

// Flight detail routes
app.get("/flights/:id/detail", authenticate, requireRoutePermission('GET', '/flights/:id/detail'), dbSession, getFlightDetail);

// Waitlist routes
app.get("/waitlist", authenticate, requireRoutePermission('GET', '/waitlist'), dbSession, getWaitlist);
app.get("/waitlist/veteran-groups", authenticate, requireRoutePermission('GET', '/waitlist/veteran-groups'), dbSession, getWaitlistVeteranGroups);

// Recent Activity routes
app.get("/recent-activity", authenticate, requireRoutePermission('GET', '/recent-activity'), dbSession, getRecentActivity);

// Export routes
app.get("/exports/flight", authenticate, requireRoutePermission('GET', '/exports/flight'), dbSession, exportFlightCsv);
app.get("/exports/callcenterfollowup", authenticate, requireRoutePermission('GET', '/exports/callcenterfollowup'), dbSession, exportCallCenterFollowUpCsv);
app.get("/exports/tourlead", authenticate, requireRoutePermission('GET', '/exports/tourlead'), dbSession, exportTourLeadCsv);

// Application review routes (separate review database)
// Intake is called by the hf_appcollector Cloud Function with a service-account ID token.
app.post("/review/applications", authenticateIntake, reviewDbSession, createReviewApplication);
app.get("/review/applications", authenticate, requireRoutePermission('GET', '/review/applications'), reviewDbSession, listReviewApplications);
app.get("/review/applications/:id", authenticate, requireRoutePermission('GET', '/review/applications/:id'), reviewDbSession, retrieveReviewApplication);
app.put("/review/applications/:id", authenticate, requireRoutePermission('PUT', '/review/applications/:id'), reviewDbSession, updateReviewApplication);
app.patch("/review/applications/:id/status", authenticate, requireRoutePermission('PATCH', '/review/applications/:id/status'), reviewDbSession, updateReviewApplicationStatus);
// Accept copies into the logistics database, so it needs both database sessions.
app.post("/review/applications/:id/accept", authenticate, requireRoutePermission('POST', '/review/applications/:id/accept'), dbSession, reviewDbSession, acceptReviewApplication);

// Expose OpenAPI spec at custom endpoint
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

app.use('/api-docs', swaggerUiServe, swaggerUiSetup);

// Cloud Run must not boot a revision with a missing FULL group, an unknown
// role variable, a malformed group email, AUTHZ_DEV_OVERRIDE_ROLES, or a
// configured group Directory cannot find. Local development (no K_SERVICE)
// warns and continues. The local override is never honored on Cloud Run.
export async function validateGroupAuthorization(options = {}) {
    const env = options.env ?? process.env;
    for (const warning of startupWarnings(env)) {
        console.warn(warning);
    }
    try {
        assertGroupAuthorizationConfigured(env);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
        return;
    }
    const entries = listConfiguredGroupEntries(env);
    if (entries.length === 0) {
        return;
    }
    try {
        await ensureAuthorizationGroupsExist(entries, { ...options, env });
    } catch (error) {
        if (typeof env.K_SERVICE === 'string' && env.K_SERVICE.trim() !== '') {
            console.error(error.message);
            process.exit(1);
            return;
        }
        console.warn(error.message);
    }
}

// Export the app for testing
export { app };

// Start the Express server only when this file is the process entry point.
// pathToFileURL matches import.meta.url on Windows (file:///C:/...) and Linux.
/* c8 ignore start */
if (isDirectRun(import.meta.url, process.argv[1])) {
    validateGroupAuthorization().then(() => {
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    });
}
/* c8 ignore stop */
