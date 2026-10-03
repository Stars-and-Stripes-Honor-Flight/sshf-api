import swaggerUi from 'swagger-ui-express';
import { specs } from './swagger.js';

const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    oauth2RedirectUrl: `${process.env.API_URL}/api-docs/oauth2-redirect.html`,
    oauth: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      appName: "SSHF API",
      scopeSeparator: " ",
      scopes: "openid email profile",
      usePkceWithAuthorizationCodeGrant: true
    },
    initOAuth: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      appName: "SSHF API",
      scopeSeparator: " ",
      scopes: "openid email profile"
    }
  },
  customSiteTitle: "SSHF API Documentation"
};

export const swaggerUiSetup = swaggerUi.setup(specs, swaggerUiOptions);
export const swaggerUiServe = swaggerUi.serve; 