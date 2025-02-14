import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import cookie from 'cookie';

// Import route handlers
import { getMessage, postMessage } from './routes/msg.js';
import { getSecureData } from './routes/secure.js';
import { getHasGroup } from './routes/user.js';
import { getSearch } from './routes/search.js';

const app = express();
const port = 8080;

// Define allowed origins for CORS
const allowedOrigins = [
    'http://localhost:3000',
    'https://sshf-ui-593951006010.us-central1.run.app'
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

// In-memory cache
const userCache = new Map();
const cacheTTL = 30 * 60 * 1000; // 30 minutes in milliseconds

// Route definitions
app.get('/secure-data', authenticate, getSecureData);
app.get('/user/hasgroup', authenticate, getHasGroup);
app.get("/msg", getMessage);
app.get("/search", authenticate, dbSession, getSearch);
app.use(express.json()); // for parsing application/json
app.post("/msg", postMessage);

// Start the Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

const dbUrl = process.env.DB_URL;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const cacheKey = `AuthSession_${dbUrl}_${dbUser}_${dbPass}`;

async function dbSession(req, res, next) {
    try {
        if (userCache.has(cacheKey)) {
            const cachedCookie = userCache.get(cacheKey);
            // Check if cache is expired
            if (Date.now() - cachedCookie.timestamp < cacheTTL) {
                req.dbCookie = cachedCookie.cookie;
                return next();
            } else {
                // Remove expired cache entry
                userCache.delete(cacheKey);
            }
        }

        const response = await fetch(`${dbUrl}/_session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: dbUser,
                password: dbPass
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create CouchDB session');
        }

        const cookieString = response.headers.get('set-cookie');
        const authCookie = `AuthSession=${cookie.parse(cookieString).AuthSession}`;
        
        // Store cookie in cache
        userCache.set(cacheKey, { cookie: authCookie, timestamp: Date.now() });

        req.dbCookie = authCookie;
        next();
    } catch (error) {
        console.error('CouchDB session error:', error);
        res.status(500).json({ message: 'Database session error' });
    }
}

async function getGroupMemberships(token, userData) {
    try {
        // Fetch user's groups from Google Workspace Directory API
        const response = await fetch(
        `https://admin.googleapis.com/admin/directory/v1/groups?userKey=${userData.sub}`,
        {
            headers: {
            Authorization: `Bearer ${token}`,
            },
        }
        );

        if (!response.ok) {
        throw new Error('Failed to fetch group memberships');
        }

        const data = await response.json();
        return data.groups || [];
    } catch (error) {
        console.error('Error fetching groups:', error);
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
            if (Date.now() - cachedData.timestamp < cacheTTL) {
                req.user = cachedData.user;
                return next();
            } else {
                // Remove expired cache entry
                userCache.delete(token);
            }
        }

        // Fetch basic user info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
            Authorization: `Bearer ${token}`,
            },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user info');
        }

        const userData = await userResponse.json();

        // Fetch group memberships
        const groups = await getGroupMemberships(token, userData);

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
