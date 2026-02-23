import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { specs } from './swagger/swagger.js';
import { swaggerUiServe, swaggerUiSetup } from './swagger/swagger-ui.js';
import { dbSession } from './utils/db.js';

// Import route handlers
import { getMessage, postMessage } from './routes/msg.js';
import { getSecureData } from './routes/secure.js';
import { getHasGroup } from './routes/user.js';
import { getSearch } from './routes/search.js';
import { createDocument, retrieveDocument, updateDocument, deleteDocument } from './routes/docs.js';
import { createVeteran, retrieveVeteran, updateVeteran, deleteVeteran, searchUnpairedVeterans, updateVeteranSeat, updateVeteranBus } from './routes/veterans.js';
import { createGuardian, retrieveGuardian, updateGuardian, deleteGuardian, updateGuardianSeat, updateGuardianBus } from './routes/guardians.js';
import { listFlights, createFlight, retrieveFlight, updateFlight } from './routes/flights.js';
import { getFlightAssignments, addVeteransToFlight } from './routes/flight-assignments.js';
import { getFlightDetail } from './routes/flight-detail.js';
import { getWaitlist } from './routes/waitlist.js';
import { getWaitlistVeteranGroups } from './routes/waitlist-veteran-groups.js';
import { getRecentActivity } from './routes/recent-activity.js';
import { exportFlightCsv, exportCallCenterFollowUpCsv, exportTourLeadCsv } from './routes/exports.js';

const app = express();
const port = 8080;

// Define allowed origins for CORS
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'https://sshf-ui-593951006010.us-central1.run.app',
    'https://sshf-api-330507742215.us-central1.run.app'
];

// Configure CORS options
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

// Enable CORS for all routes with specific options
app.use(cors(corsOptions));

// In-memory cache for user authentication
const userCache = new Map();
const userCacheTTL = 30 * 60 * 1000; // 30 minutes in milliseconds

// Route definitions
app.get('/secure-data', authenticate, getSecureData);
app.get('/user/hasgroup', authenticate, getHasGroup);
app.get("/msg", getMessage);
app.get("/search", authenticate, dbSession, getSearch);
app.use(express.json()); // for parsing application/json
app.post("/msg", postMessage);

// Generic document routes
app.post("/docs", authenticate, dbSession, createDocument);
app.get("/docs/:id", authenticate, dbSession, retrieveDocument);
app.put("/docs/:id", authenticate, dbSession, updateDocument);
app.delete("/docs/:id", authenticate, dbSession, deleteDocument);

// Veteran-specific routes
app.post("/veterans", authenticate, dbSession, createVeteran);
app.get("/veterans/search", authenticate, dbSession, searchUnpairedVeterans);
app.get("/veterans/:id", authenticate, dbSession, retrieveVeteran);
app.put("/veterans/:id", authenticate, dbSession, updateVeteran);
app.patch("/veterans/:id/seat", authenticate, dbSession, updateVeteranSeat);
app.patch("/veterans/:id/bus", authenticate, dbSession, updateVeteranBus);
app.delete("/veterans/:id", authenticate, dbSession, deleteVeteran);

// Guardian-specific routes
app.post("/guardians", authenticate, dbSession, createGuardian);
app.get("/guardians/:id", authenticate, dbSession, retrieveGuardian);
app.put("/guardians/:id", authenticate, dbSession, updateGuardian);
app.patch("/guardians/:id/seat", authenticate, dbSession, updateGuardianSeat);
app.patch("/guardians/:id/bus", authenticate, dbSession, updateGuardianBus);
app.delete("/guardians/:id", authenticate, dbSession, deleteGuardian);

// Flight-specific routes
app.get("/flights", authenticate, dbSession, listFlights);
app.post("/flights", authenticate, dbSession, createFlight);
app.get("/flights/:id", authenticate, dbSession, retrieveFlight);
app.put("/flights/:id", authenticate, dbSession, updateFlight);

// Flight assignment routes
app.get("/flights/:id/assignments", authenticate, dbSession, getFlightAssignments);
app.post("/flights/:id/assignments", authenticate, dbSession, addVeteransToFlight);

// Flight detail routes
app.get("/flights/:id/detail", authenticate, dbSession, getFlightDetail);

// Waitlist routes
app.get("/waitlist", authenticate, dbSession, getWaitlist);
app.get("/waitlist/veteran-groups", authenticate, dbSession, getWaitlistVeteranGroups);

// Recent Activity routes
app.get("/recent-activity", authenticate, dbSession, getRecentActivity);

// Export routes
app.get("/exports/flight", authenticate, dbSession, exportFlightCsv);
app.get("/exports/callcenterfollowup", authenticate, dbSession, exportCallCenterFollowUpCsv);
app.get("/exports/tourlead", authenticate, dbSession, exportTourLeadCsv);

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
