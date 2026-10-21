import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { AppContainer } from './container.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { apiRoutes } from './routes/index.js';

/**
 * Monta a aplicação Express sem abrir porta. Recebe as dependências prontas
 * (raiz de composição em `container.ts`), o que permite testar com Supertest.
 */
export function createApp(container: AppContainer): Express {
  const { env, logger } = container;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  const openApiDocument = buildOpenApiDocument();
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use('/api/v1', apiRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
