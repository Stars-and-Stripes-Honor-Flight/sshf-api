import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { specs } from './swagger/swagger.js';
import { swaggerUiServe, swaggerUiSetup } from './swagger/swagger-ui.js';
import { dbSession } from './utils/db.js';
import { buildCorsOptions } from './utils/cors.js';
import { assertValidTokenClaims, TokenAudienceError, authorize } from './utils/auth.js';

// Import route handlers
import { getMessage, postMessage } from './routes/msg.js';
import { getSecureData } from './routes/secure.js';
import { getHasGroup } from './routes/user.js';
import { getSearch } from './routes/search.js';
import { createDocument, retrieveDocument, updateDocument, deleteDocument } from './routes/docs.js';
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

const app = express();
const port = 8080;

// Enable CORS for all routes with specific options
app.use(cors(buildCorsOptions()));

// In-memory cache for user authentication
const userCache = new Map();
const userCacheTTL = 30 * 60 * 1000; // 30 minutes in milliseconds

// Client used only to introspect incoming access tokens (validate audience)
const tokenInfoClient = new OAuth2Client();

// Route definitions
app.get('/secure-data', authenticate, authorize, getSecureData);
app.get('/user/hasgroup', authenticate, getHasGroup);
app.get("/msg", getMessage);
app.get("/search", authenticate, authorize, dbSession, getSearch);
app.use(express.json()); // for parsing application/json
app.post("/msg", postMessage);

// Generic document routes
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

// Expose OpenAPI spec at custom endpoint
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

app.use('/api-docs', swaggerUiServe, swaggerUiSetup);

// Start the Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

async function getGroupMemberships(userData) {
    try {
        
        // First try using Application Default Credentials (will work in Cloud Run)
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/admin.directory.group.readonly']
        });
        console.log('Using Application Default Credentials for authentication');

        // Create the Admin Directory API client with the delegated service account
        const admin = google.admin({ version: 'directory_v1', auth });

        // Extract domain from user's email
        const domain = userData.email.split('@')[1];

        // Fetch all groups the user is a member of
        const response = await admin.groups.list({
            userKey: userData.email,
            domain: domain,
            maxResults: 100
        });

        return response.data.groups || [];

    } catch (error) {

        try{
            if (error.message.includes('Could not load the default credentials')) {

                console.log('ADC authentication failed, falling back to JWT with env vars:', error.message);
                
                // Fall back to JWT with explicit credentials (for local development)
                const auth = new google.auth.JWT({
                    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    scopes: [
                        'https://www.googleapis.com/auth/admin.directory.group.readonly'
                    ]
                });

                // Create the Admin Directory API client with the delegated service account
                const admin = google.admin({ version: 'directory_v1', auth });

                // Extract domain from user's email
                const domain = userData.email.split('@')[1];

                // Fetch all groups the user is a member of
                const response = await admin.groups.list({
                    userKey: userData.email,
                    domain: domain,
                    maxResults: 100
                });

                return response.data.groups || [];
            }
        } catch (error) {
            console.error('Error fetching groups:', error.message);
            if (error.response) {
                console.error('Error details:', {
                    status: error.response.status,
                    data: error.response.data
                });
            }

        }

        return [];
    }
}

// Middleware to authenticate Google users
async function authenticate(req, res, next) {
    try {
        // Get the token from the Authorization header (assuming it's a Bearer token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: No Bearer token provided' });
        }
        const token = authHeader.split(' ')[1];

        // Check if user data is in cache
        if (userCache.has(token)) {
            const cachedData = userCache.get(token);
            // Check if cache is expired
            if (Date.now() - cachedData.timestamp < userCacheTTL) {
                req.user = cachedData.user;
                return next();
            } else {
                // Remove expired cache entry
                userCache.delete(token);
            }
        }

        // Introspect the token so we can confirm it was actually issued for
        // this application's OAuth client. A valid Google token alone is not
        // enough: without this check any Google access token from any client
        // would be accepted.
        let tokenInfo;
        try {
            tokenInfo = await tokenInfoClient.getTokenInfo(token);
        } catch (introspectionError) {
            const status = introspectionError?.status ?? introspectionError?.response?.status;
            if (status && status >= 400 && status < 500) {
                return res.status(401).json({ message: 'Unauthorized: Invalid token' });
            }
            console.error('Token introspection failed:', introspectionError?.message);
            return res.status(503).json({ message: 'Authentication service unavailable' });
        }

        try {
            assertValidTokenClaims({
                aud: tokenInfo.aud,
                email: tokenInfo.email,
                emailVerified: tokenInfo.email_verified
            });
        } catch (validationError) {
            if (validationError instanceof TokenAudienceError) {
                return res.status(401).json({ message: 'Unauthorized: Token not issued for this application' });
            }
            return res.status(403).json({ message: 'Forbidden: Account not permitted' });
        }

        // Fetch basic user info
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: token });

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userResponse = await oauth2.userinfo.get();

        if (!userResponse.data) {
            throw new Error('Failed to fetch user info');
        }

        const userData = userResponse.data;

        // Fetch group memberships
        const groups = await getGroupMemberships(userData);

        // Map groups to roles (customize this based on your needs)
        const roles = groups.map(group => ({
            id: group.id,
            name: group.name,
            email: group.email
        }));

        const user = {
            id: userData.sub,
            email: userData.email,
            firstName: userData.given_name,
            lastName: userData.family_name,
            avatar: userData.picture,
            roles: roles // Add roles to user data
        };

        // Store user data in cache
        userCache.set(token, { user: user, timestamp: Date.now() });

        // Attach user information to the request object (optional)
        req.user = user;

        // Proceed to the next middleware or route handler
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
}
