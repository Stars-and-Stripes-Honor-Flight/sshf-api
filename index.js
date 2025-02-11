import 'dotenv/config';
import express from 'express';
import { PoliciesClient } from '@google-cloud/iam';
import { OAuth2Client } from 'google-auth-library';
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

// Initialize IAM client
const iamClient = new PoliciesClient();

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

// Function to check if the user has a specific role
async function checkUserRole(userEmail, requiredRole) {
    const request = {
        resource: `projects/sshf-api-dev`,
    };

    try {
        // Get IAM policy
        const [policy] = await iamClient.getIamPolicy(request);

        // Check if the user is assigned the required role
        const bindings = policy.bindings || [];
        for (const binding of bindings) {
            if (binding.role === requiredRole) {
                if (binding.members.includes(`user:${userEmail}`)) {
                    return true; // User has the required role
                }
            }
        }
        return false; // User does not have the required role
    } catch (error) {
        console.error('Error checking IAM policy:', error);
        return false;
    }
}

// Middleware to authenticate Google users
async function authenticate(req, res, next) {
    const clientId = '330507742215-scerc6p0lvou59tufmohq1b7b4bj0l90.apps.googleusercontent.com';

    try {
        // Get the token from the Authorization header (assuming it's a Bearer token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: No Bearer token provided' });
        }
        const token = authHeader.split(' ')[1];

        // Verify the token using the Google Auth Library
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: clientId,
        });
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        const userEmail = payload['email'];


        // Check if the user has a specific role (e.g., `roles/editor`)
        const hasRole = await checkUserRole(userEmail, 'roles/editor');
        if (!hasRole) {
            return res.status(403).json({ message: 'Permission denied' });
        }

        // Attach user information to the request object (optional)
        req.user = {
            id: userid,
            email: userEmail,
        };

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

app.get("/msg", async (req, res, next) => {
    const dbResult = await testdb();
    res.json({
        "message": "Hello, World!",
        "url": dbUrl,
        "doc_count": dbResult.doc_count
    });
});

app.get("/search", async (req, res, next) => {
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
        const queryParams = searchRequest.toQueryParams();
        const url = `${dbUrl}/_design/basic/_view/all_by_status_and_name?${queryParams}&descending=false&type=newRows`;
        
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