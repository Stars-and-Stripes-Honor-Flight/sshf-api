import swaggerJsdoc from 'swagger-jsdoc';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// Load schema files
const loadSchema = (filename) => {
  const filePath = join(process.cwd(), 'schemas', `${filename}.yaml`);
  return yaml.load(readFileSync(filePath, 'utf8'));
};

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SSHF API',
      version: '1.0.0',
      description: 'API for managing veterans documents with Google authentication',
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:8080',
        description: 'API Server',
      },
      {
        url: 'http://localhost:8080',
        description: 'Force local API Server',
      },
      {
        url: 'https://sshf-api-330507742215.us-central1.run.app',
        description: 'Force Dev Environment API Server',
      },
    ],
    components: {
      securitySchemes: {
        GoogleAuth: {
          type: 'oauth2',
          flows: {
            implicit: {
              authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
              scopes: {
                'openid': 'OpenID Connect scope',
                'email': 'Email scope',
                'profile': 'Profile scope',
                'https://www.googleapis.com/auth/admin.directory.group.readonly': 'Group Read Only Scope'
              }
            }
          },
          'x-clientId': process.env.GOOGLE_CLIENT_ID,
          'x-init': {
            clientId: process.env.GOOGLE_CLIENT_ID,
            appName: 'SSHF API'
          }
        }
      },
      schemas: {
        SearchRequest: loadSchema('SearchRequest'),
        SearchResult: loadSchema('SearchResult'),
        SearchResults: loadSchema('SearchResults'),
        Error: loadSchema('Error'),
        Veteran: loadSchema('Veteran'),
        Guardian: loadSchema('Guardian'),
        Flight: loadSchema('Flight'),
        UnpairedVeteranResult: loadSchema('UnpairedVeteranResult'),
        UnpairedVeteranResults: loadSchema('UnpairedVeteranResults')
      }
    },
    security: [
      {
        GoogleAuth: ['openid', 'email', 'profile']
      }
    ]
  },
  apis: ['./routes/*.js'], // Path to the API routes
};

export const specs = swaggerJsdoc(options); 