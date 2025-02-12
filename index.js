import 'dotenv/config';
import express from 'express';
import { Message } from './models/message.js';
import { SearchRequest } from './models/search_request.js';
import { SearchResults } from './models/search_results.js';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const port = 8080;
const dbUrl = process.env.DB_URL;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;

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

// Sample route that requires Google IAM role check
app.get('/secure-data', authenticate, (req, res) => {
    res.json({ message: 'This is secure data.' });
});

app.get('/user/hasgroup', authenticate, (req, res) => {
    const roles = req.user?.roles;
    const groupEmail = req.query.groupEmail;
    const hasGroup =  roles?.some(role => role.email === groupEmail) ?? false;
    res.json({ hasgroup: hasGroup });
});

app.get("/msg", async (req, res, next) => {
    const dbResult = await testdb();
    res.json({
        "message": "Hello, World!",
        "url": dbUrl,
        "doc_count": dbResult.doc_count
    });
});

app.get("/search", authenticate, async (req, res, next) => {
    const searchRequest = new SearchRequest(req.query);
    const dbResult = await search(searchRequest);
    const searchResults = new SearchResults(dbResult);
    res.json(searchResults.toJSON());
});

app.use(express.json()); // for parsing application/json

app.post("/msg", (req, res, next) => {
    const newMessage = new Message(req.body.message);
    res.json({"receivedMessage": newMessage.getContent()});
});

async function search(searchRequest) {
    try {
        const auth = Buffer.from(`${dbUser}:${dbPass}`).toString('base64');
        const viewName = searchRequest.getViewName();
        const queryParams = searchRequest.toQueryParams();
        const url = `${dbUrl}/_design/basic/_view/${viewName}?${queryParams}&descending=false`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }
}

async function testdb() {
    try {
        const auth = Buffer.from(`${dbUser}:${dbPass}`).toString('base64');
        const response = await fetch(dbUrl, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }
}

// Start the Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});