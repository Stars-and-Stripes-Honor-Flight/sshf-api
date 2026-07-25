import { expect } from 'chai';
import { getServers } from '../swagger/swagger.js';

describe('Swagger servers configuration', () => {
    const originalApiUrl = process.env.API_URL;

    afterEach(() => {
        if (originalApiUrl === undefined) {
            delete process.env.API_URL;
        } else {
            process.env.API_URL = originalApiUrl;
        }
    });

    it('returns a single server with localhost fallback when API_URL is unset', () => {
        delete process.env.API_URL;
        expect(getServers()).to.deep.equal([
            {
                url: 'http://localhost:8080',
                description: 'API Server'
            }
        ]);
    });

    it('returns a single server using API_URL when set', () => {
        process.env.API_URL = 'https://sshf-api.example.run.app';
        expect(getServers()).to.deep.equal([
            {
                url: 'https://sshf-api.example.run.app',
                description: 'API Server'
            }
        ]);
    });

    it('does not include a hardcoded dev environment server entry', () => {
        delete process.env.API_URL;
        const servers = getServers();
        const urls = servers.map((server) => server.url);
        expect(urls).to.not.include('https://sshf-api-330507742215.us-central1.run.app');
    });

    it('does not include a separate force-local server entry', () => {
        process.env.API_URL = 'https://sshf-api.example.run.app';
        const servers = getServers();
        expect(servers).to.have.lengthOf(1);
        expect(servers[0].description).to.equal('API Server');
    });
});
