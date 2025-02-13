import { Message } from '../models/message.js';

const dbUrl = process.env.DB_URL;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;

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

export async function getMessage(req, res, next) {
    const dbResult = await testdb();
    res.json({
        "message": "Hello, World!",
        "url": dbUrl,
        "doc_count": dbResult.doc_count
    });
}

export function postMessage(req, res, next) {
    const newMessage = new Message(req.body.message);
    res.json({"receivedMessage": newMessage.getContent()});
} 