import 'dotenv/config';
import express from 'express';
import { PoliciesClient } from '@google-cloud/iam';
import { GoogleAuth } from 'google-auth-library';
import { Message } from './models/message.js';

const app = express();
const port = 8080;

// Initialize IAM client
const iamClient = new PoliciesClient();

// Function to check if the user has a specific role
async function checkUserRole(userEmail, requiredRole) {
    const request = {
        resource: `projects/YOUR_PROJECT_ID`,
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
    const auth = new GoogleAuth({
        scopes: 'https://www.googleapis.com/auth/cloud-platform', // Adjust the scope as needed
    });

    try {
        const client = await auth.getClient();
        const userInfo = await client.getTokenInfo(req.headers.authorization);

        // Check if the user has a specific role (e.g., `roles/editor`)
        const hasRole = await checkUserRole(userInfo.email, 'roles/editor');
        if (!hasRole) {
            return res.status(403).json({ message: 'Permission denied' });
        }

        // Proceed to the next middleware or route handler
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ message: 'Unauthorized' });
    }
}

// Sample route that requires Google IAM role check
app.get('/secure-data', authenticate, (req, res) => {
    res.json({ message: 'This is secure data.' });
});

app.get("/msg", (req, res, next) => {
    res.json({"message": "Hello, World!"});
});

app.use(express.json()); // for parsing application/json

app.post("/msg", (req, res, next) => {
    const newMessage = new Message(req.body.message);
    res.json({"receivedMessage": newMessage.getContent()});
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});