# SSHF API

A RESTful API for managing Stars and Stripes Honor Flight operations, including veteran and guardian registration, flight management, and search functionality.

## Overview

This API provides the backend services for the SSHF application, enabling:

- **Veteran Management** — Create, retrieve, update, and delete veteran records with full validation
- **Guardian Management** — Manage guardian records with veteran pairing support
- **Flight Management** — Track honor flights, capacity, and completion status
- **Search** — Query veterans and guardians by name, status, or flight assignment
- **User Authentication** — Google OAuth integration with domain-based group membership

## Technology Stack

- **Runtime**: Node.js with ES Modules
- **Framework**: Express.js
- **Database**: CouchDB (accessed via REST API)
- **Authentication**: Google OAuth 2.0 with Google Workspace group support
- **Hosting**: Google Cloud Run
- **Documentation**: OpenAPI 3.0 / Swagger UI

## Getting Started

### Prerequisites

- Node.js 18+
- Access to a CouchDB instance
- Google Cloud project with OAuth configured
- Google Workspace domain (for group-based authorization)

### Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DB_URL` | CouchDB server URL |
| `DB_NAME` | Database name |
| `DB_USER` | CouchDB username |
| `DB_PASS` | CouchDB password |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email (local dev) |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key (local dev) |

> **Note**: In Cloud Run, Application Default Credentials are used automatically. The service account variables are only needed for local development.

### Installation

```bash
npm install
```

### Running Locally

```bash
node index.js
```

The server starts at `http://localhost:8080`.

### Running Tests

```bash
npm test
```

### Test Coverage

```bash
npm run coverage
```

## API Documentation

Interactive API documentation is available at `/api-docs` when the server is running.

The OpenAPI specification can be accessed directly at `/openapi.json`.

## Project Structure

```
sshf-api/
├── index.js           # Application entry point and middleware
├── models/            # Data models with validation
├── routes/            # Route handlers for each resource
├── schemas/           # OpenAPI schema definitions (YAML)
├── swagger/           # Swagger/OpenAPI configuration
├── utils/             # Shared utilities (database helpers)
└── test/              # Unit tests
```

## Contributing

### Code Style

- Use ES Module syntax (`import`/`export`)
- Follow existing patterns for route handlers and models
- Include JSDoc comments for public functions

### Adding New Features

1. Create or update models in `models/` with validation
2. Add route handlers in `routes/`
3. Document endpoints using JSDoc OpenAPI annotations
4. Add corresponding tests in `test/`
5. Ensure 100% test coverage is maintained

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with appropriate tests
3. Run `npm run coverage` to verify tests pass with full coverage
4. Submit a pull request for review

## License

ISC License — see [LICENSE](LICENSE) for details.
