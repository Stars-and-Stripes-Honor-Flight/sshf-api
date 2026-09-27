import { expect } from 'chai';
import { swaggerUiSetup, swaggerUiServe } from '../swagger/swagger-ui.js';

describe('Swagger UI configuration', () => {
    it('should export swaggerUiSetup middleware', () => {
        expect(swaggerUiSetup).to.be.a('function');
    });

    it('should export swaggerUiServe middleware array', () => {
        expect(swaggerUiServe).to.be.an('array');
        expect(swaggerUiServe.length).to.be.greaterThan(0);
    });
});
