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
import { authorize, assertGroupAuthorizationConfigured } from './utils/auth.js';
import { getGroupMemberships } from './utils/groups.js';
import { createUserCache } from './utils/user_cache.js';
import { createAuthenticator } from './utils/authenticate.js';

// Import route handlers
import { getHasGroup } from './routes/user.js';
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

// Successful authentications are cached for 15 minutes (see utils/user_cache.js).
// Keys are SHA-256 hashes of the bearer token, expired entries are swept on
// access, and the map is capped at USER_CACHE_MAX_ENTRIES.
const userCache = createUserCache();

// Client used only to introspect incoming access tokens (validate audience)
const tokenInfoClient = new OAuth2Client();

async function getUserInfo(token) {
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
const authenticate = createAuthenticator({
    getTokenInfo: (token) => tokenInfoClient.getTokenInfo(token),
    getUserInfo,
    getGroupMemberships,
    cache: userCache
});

// Route definitions
app.get('/user/hasgroup', authenticate, getHasGroup);
app.get("/search", authenticate, authorize, dbSession, getSearch);
app.use(express.json()); // for parsing application/json
app.post("/query", authenticate, authorize, dbSession, postQuery);

// Generic document routes
app.get("/docs/:id/revisions", authenticate, authorize, dbSession, listDocumentRevisions);
app.get("/docs/:id/diff", authenticate, authorize, dbSession, diffDocument);
app.post("/docs", authenticate, authorize, dbSession, createDocument);
app.get("/docs/:id", authenticate, authorize, dbSession, retrieveDocument);
app.put("/docs/:id", authenticate, authorize, dbSession, updateDocument);
app.delete("/docs/:id", authenticate, authorize, dbSession, deleteDocument);

// Veteran-specific routes
app.post("/veterans", authenticate, authorize, dbSession, createVeteran);
app.get("/veterans/search", authenticate, authorize, dbSession, searchUnpairedVeterans);
app.get("/veterans/:id", authenticate, authorize, dbSession, retrieveVeteran);
app.put("/veterans/:id", authenticate, authorize, dbSession, updateVeteran);
app.patch("/veterans/:id/seat", authenticate, authorize, dbSession, updateVeteranSeat);
app.patch("/veterans/:id/bus", authenticate, authorize, dbSession, updateVeteranBus);
app.patch("/veterans/:id/mail-call-received", authenticate, authorize, dbSession, updateVeteranMailCallReceived);
app.patch("/veterans/:id/mail-call-adopt", authenticate, authorize, dbSession, updateVeteranMailCallAdopt);
app.patch("/veterans/:id/medical-form", authenticate, authorize, dbSession, updateVeteranMedicalForm);
app.patch("/veterans/:id/medical-review", authenticate, authorize, dbSession, updateVeteranMedicalReview);
app.patch("/veterans/:id/vaccinated", authenticate, authorize, dbSession, updateVeteranVaccinated);
app.patch("/veterans/:id/homecoming-destination", authenticate, authorize, dbSession, updateVeteranHomecomingDestination);
app.patch("/veterans/:id/apparel-shirt-size", authenticate, authorize, dbSession, updateVeteranApparelShirtSize);
app.patch("/veterans/:id/apparel-jacket-size", authenticate, authorize, dbSession, updateVeteranApparelJacketSize);
app.patch("/veterans/:id/apparel-notes", authenticate, authorize, dbSession, updateVeteranApparelNotes);
app.delete("/veterans/:id", authenticate, authorize, dbSession, deleteVeteran);

// Guardian-specific routes
app.post("/guardians", authenticate, authorize, dbSession, createGuardian);
app.get("/guardians/:id", authenticate, authorize, dbSession, retrieveGuardian);
app.put("/guardians/:id", authenticate, authorize, dbSession, updateGuardian);
app.patch("/guardians/:id/seat", authenticate, authorize, dbSession, updateGuardianSeat);
app.patch("/guardians/:id/bus", authenticate, authorize, dbSession, updateGuardianBus);
app.patch("/guardians/:id/training-notes", authenticate, authorize, dbSession, updateGuardianTrainingNotes);
app.patch("/guardians/:id/training-complete", authenticate, authorize, dbSession, updateGuardianTrainingComplete);
app.patch("/guardians/:id/waiver", authenticate, authorize, dbSession, updateGuardianWaiver);
app.patch("/guardians/:id/training-see-doc", authenticate, authorize, dbSession, updateGuardianTrainingSeeDoc);
app.patch("/guardians/:id/vaccinated", authenticate, authorize, dbSession, updateGuardianVaccinated);
app.patch("/guardians/:id/medical-form", authenticate, authorize, dbSession, updateGuardianMedicalForm);
app.patch("/guardians/:id/paid", authenticate, authorize, dbSession, updateGuardianPaid);
app.patch("/guardians/:id/books-ordered", authenticate, authorize, dbSession, updateGuardianBooksOrdered);
app.patch("/guardians/:id/apparel-shirt-size", authenticate, authorize, dbSession, updateGuardianApparelShirtSize);
app.patch("/guardians/:id/apparel-jacket-size", authenticate, authorize, dbSession, updateGuardianApparelJacketSize);
app.patch("/guardians/:id/apparel-notes", authenticate, authorize, dbSession, updateGuardianApparelNotes);
app.delete("/guardians/:id", authenticate, authorize, dbSession, deleteGuardian);

// Flight-specific routes
app.get("/flights", authenticate, authorize, dbSession, listFlights);
app.post("/flights", authenticate, authorize, dbSession, createFlight);
app.get("/flights/:id", authenticate, authorize, dbSession, retrieveFlight);
app.put("/flights/:id", authenticate, authorize, dbSession, updateFlight);

// Flight assignment routes
app.get("/flights/:id/assignments", authenticate, authorize, dbSession, getFlightAssignments);
app.post("/flights/:id/assignments", authenticate, authorize, dbSession, addVeteransToFlight);

// Flight detail routes
app.get("/flights/:id/detail", authenticate, authorize, dbSession, getFlightDetail);

// Waitlist routes
app.get("/waitlist", authenticate, authorize, dbSession, getWaitlist);
app.get("/waitlist/veteran-groups", authenticate, authorize, dbSession, getWaitlistVeteranGroups);

// Recent Activity routes
app.get("/recent-activity", authenticate, authorize, dbSession, getRecentActivity);

// Export routes
app.get("/exports/flight", authenticate, authorize, dbSession, exportFlightCsv);
app.get("/exports/callcenterfollowup", authenticate, authorize, dbSession, exportCallCenterFollowUpCsv);
app.get("/exports/tourlead", authenticate, authorize, dbSession, exportTourLeadCsv);

// Application review routes (separate review database)
// Intake is called by the hf_appcollector Cloud Function with a service-account ID token.
app.post("/review/applications", authenticateIntake, reviewDbSession, createReviewApplication);
app.get("/review/applications", authenticate, authorize, reviewDbSession, listReviewApplications);
app.get("/review/applications/:id", authenticate, authorize, reviewDbSession, retrieveReviewApplication);
app.put("/review/applications/:id", authenticate, authorize, reviewDbSession, updateReviewApplication);
app.patch("/review/applications/:id/status", authenticate, authorize, reviewDbSession, updateReviewApplicationStatus);
// Accept copies into the logistics database, so it needs both database sessions.
app.post("/review/applications/:id/accept", authenticate, authorize, dbSession, reviewDbSession, acceptReviewApplication);

// Expose OpenAPI spec at custom endpoint
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

app.use('/api-docs', swaggerUiServe, swaggerUiSetup);

// Cloud Run must not boot a revision that skips the Workspace group gate.
// Local development (no K_SERVICE) may omit ALLOWED_GROUP_EMAILS.
try {
    assertGroupAuthorizationConfigured();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

// Start the Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
