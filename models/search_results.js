import { SearchResult } from './search_result.js';

export class SearchResults {
    constructor(data) {
        this.totalRows = data.total_rows;
        this.offset = data.offset;
        this.rows = data.rows.map(row => ({
            id: row.id,
            key: row.key,
            value: new SearchResult(row.value)
        }));
    }

    // Getter methods
    getTotalRows() { return this.totalRows; }
    getOffset() { return this.offset; }
    getRows() { return this.rows; }

    // Get array of just the SearchResult objects
    getSearchResults() {
        return this.rows.map(row => row.value);
    }

    // Convert to JSON object
    toJSON() {
        return {
            total_rows: this.totalRows,
            offset: this.offset,
            rows: this.rows.map(row => ({
                id: row.id,
                key: row.key,
                value: row.value.toJSON()
            }))
        };
    }
} 