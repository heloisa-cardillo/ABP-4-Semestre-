import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import { z } from 'zod';
import { liveness } from '../controllers/health.controller.js';

export function healthRoutes(): Router {
  const router = Router();
  router.get('/health', liveness);
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
        content: {
          'application/json': {
            schema: z.object({ status: z.literal('ok'), uptimeSeconds: z.number().int() }),
          },
        },
      },
    },
  });
}
