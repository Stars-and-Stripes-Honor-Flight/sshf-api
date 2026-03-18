import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const loadSchemaFile = (filename) => {
  const filePath = join(process.cwd(), 'schemas', `${filename}.yaml`);
  const content = yaml.load(readFileSync(filePath, 'utf8'));
  if (content.type) {
    return { [filename]: content };
  }
  return content;
};

const loadAllSchemas = (...filenames) => {
  return filenames.reduce((acc, filename) => {
    return { ...acc, ...loadSchemaFile(filename) };
  }, {});
};

/**
 * Extract @swagger JSDoc blocks from all .js files in a directory and
 * return the merged OpenAPI paths object. Replaces swagger-jsdoc without
 * pulling in glob or any other transitive dependency.
 */
const extractSwaggerPaths = (dir) => {
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const paths = {};

  for (const file of files) {
    const source = readFileSync(join(dir, file), 'utf8');
    const commentBlocks = source.match(/\/\*\*[\s\S]*?\*\//g) || [];

    for (const block of commentBlocks) {
      if (!block.includes('@swagger')) continue;

      const yamlContent = block
        .replace(/^\/\*\*/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .filter(line => !line.trim().startsWith('@swagger'))
        .join('\n');

      const parsed = yaml.load(yamlContent);
      if (parsed && typeof parsed === 'object') {
        for (const [path, methods] of Object.entries(parsed)) {
          paths[path] = { ...paths[path], ...methods };
        }
      }
    }
  }
  return paths;
};

const definition = {
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
    schemas: loadAllSchemas(
      'SearchRequest',
      'SearchResult',
      'SearchResults',
      'Error',
      'Veteran',
      'Guardian',
      'Flight',
      'FlightAssignment',
      'UnpairedVeteranResult',
      'UnpairedVeteranResults',
      'RecentActivityEntry',
      'FlightDetailResult',
      'WaitlistVeteranGroup'
    )
  },
  security: [
    {
      GoogleAuth: ['openid', 'email', 'profile']
    }
  ]
};

export const specs = {
  ...definition,
  paths: extractSwaggerPaths(join(process.cwd(), 'routes'))
}; 