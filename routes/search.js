import { SearchRequest } from '../models/search_request.js';
import { SearchResults } from '../models/search_results.js';

const dbUrl = process.env.DB_URL;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;

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

export async function getSearch(req, res, next) {
    const searchRequest = new SearchRequest(req.query);
    const dbResult = await search(searchRequest);
    const searchResults = new SearchResults(dbResult);
    res.json(searchResults.toJSON());
} 