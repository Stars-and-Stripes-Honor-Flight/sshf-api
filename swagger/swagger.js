import swaggerJsdoc from 'swagger-jsdoc';

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
                'profile': 'Profile scope'
              }
            }
          }
        }
      },
      schemas: {
        SearchRequest: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              default: 25,
              description: 'Maximum number of results to return'
            },
            lastname: {
              type: 'string',
              default: '',
              description: 'Last name to search for'
            },
            status: {
              type: 'string',
              default: 'Active',
              enum: ['Active', 'All'],
              description: 'Status filter for the search'
            },
            flight: {
              type: 'string',
              default: 'All',
              description: 'Flight ID filter for the search'
            }
          }
        },
        SearchResult: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of the document'
            },
            name: {
              type: 'string',
              description: 'Name of the person'
            },
            city: {
              type: 'string',
              description: 'City of residence'
            },
            appdate: {
              type: 'string',
              description: 'Application date'
            },
            flight: {
              type: 'string',
              description: 'Flight assignment'
            },
            status: {
              type: 'string',
              description: 'Current status'
            },
            pairing: {
              type: 'string',
              description: 'Name of paired person'
            },
            pairingId: {
              type: 'string',
              description: 'ID of paired person'
            }
          }
        },
        SearchResults: {
          type: 'object',
          properties: {
            total_rows: {
              type: 'integer',
              description: 'Total number of rows in the result set'
            },
            offset: {
              type: 'integer',
              description: 'Starting offset of the result set'
            },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Document ID'
                  },
                  key: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Search key used for this result'
                  },
                  value: {
                    $ref: '#/components/schemas/SearchResult'
                  }
                }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string'
            }
          }
        },
        Veteran: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            _id: {
              type: 'string',
              description: 'Document ID'
            },
            _rev: {
              type: 'string',
              description: 'Document revision'
            },
            type: {
              type: 'string',
              enum: ['Veteran'],
              description: 'Document type, must be "Veteran"'
            },
            name: {
              type: 'object',
              required: ['first', 'last'],
              properties: {
                first: { type: 'string' },
                middle: { type: 'string' },
                last: { type: 'string' },
                nickname: { type: 'string' }
              }
            },
            birth_date: { type: 'string' },
            gender: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                zip: { type: 'string' },
                county: { type: 'string' },
                phone_day: { type: 'string' },
                phone_eve: { type: 'string' },
                phone_mbl: { type: 'string' },
                email: { type: 'string' }
              }
            },
            service: {
              type: 'object',
              properties: {
                branch: { type: 'string' },
                rank: { type: 'string' },
                dates: { type: 'string' },
                activity: { type: 'string' }
              }
            },
            flight: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string', default: 'Active' },
                group: { type: 'string' },
                bus: { type: 'string' },
                seat: { type: 'string' },
                confirmed_date: { type: 'string' },
                confirmed_by: { type: 'string' },
                status_note: { type: 'string' },
                history: { type: 'array', items: { type: 'object' } }
              }
            },
            medical: {
              type: 'object',
              properties: {
                form: { type: 'boolean', default: false },
                release: { type: 'boolean', default: false },
                level: { type: 'string' },
                limitations: { type: 'string' },
                food_restriction: { type: 'string', default: 'None' },
                usesCane: { type: 'boolean', default: false },
                usesWalker: { type: 'boolean', default: false },
                usesWheelchair: { type: 'number', default: 0 },
                usesScooter: { type: 'boolean', default: false },
                requiresOxygen: { type: 'boolean', default: false }
              }
            },
            guardian: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                pref_notes: { type: 'string' },
                history: { type: 'array', items: { type: 'object' } }
              }
            },
            app_date: { type: 'string' },
            vet_type: { type: 'string' },
            shirt: {
              type: 'object',
              properties: {
                size: { type: 'string' }
              }
            },
            metadata: {
              type: 'object',
              properties: {
                created_at: { type: 'string', format: 'date-time' },
                created_by: { type: 'string' },
                updated_at: { type: 'string', format: 'date-time' },
                updated_by: { type: 'string' }
              }
            }
          }
        }
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