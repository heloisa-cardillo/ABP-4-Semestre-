import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { liveness, readiness } from '../controllers/health.controller.js';
import { json } from '../docs/openapi.js';

export function healthRoutes({ prisma }: AppContainer): Router {
  const router = Router();
  router.get('/health', liveness);
  router.get('/health/ready', readiness(prisma));
  return router;
}

export function documentHealthRoutes(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Saúde'],
    summary: 'Verifica se a API está no ar',
    responses: {
      200: {
        description: 'API no ar',
        ...json(z.object({ status: z.literal('ok'), uptimeSeconds: z.number().int() })),
      },
    },
  });

  const readinessSchema = z.object({
    status: z.enum(['ok', 'unavailable']),
    database: z.enum(['up', 'down']),
  });
  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    tags: ['Saúde'],
    summary: 'Verifica se a API alcança o banco de dados',
    responses: {
      200: { description: 'Pronta', ...json(readinessSchema) },
      503: { description: 'Banco indisponível', ...json(readinessSchema) },
    },
  });
}
