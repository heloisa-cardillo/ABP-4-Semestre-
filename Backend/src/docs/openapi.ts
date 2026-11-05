import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { documentAuthRoutes } from '../routes/auth.routes.js';
import { documentHealthRoutes } from '../routes/health.routes.js';
import { documentUserRoutes } from '../routes/users.routes.js';

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'VALIDATION_ERROR' }),
      message: z.string().meta({ example: 'Dados inválidos.' }),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

/** Corpo JSON de requisição ou resposta, para a documentação das rotas. */
export function json<T>(schema: T) {
  return { content: { 'application/json': { schema } } };
}

/** Resposta de erro padrão, para reaproveitar na documentação das rotas. */
export function errorResponse(description: string) {
  return { description, ...json(errorResponseSchema) };
}

/**
 * Monta o documento OpenAPI a partir dos mesmos schemas Zod que validam as requisições:
 * a documentação não tem como divergir do que a API aceita.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  documentHealthRoutes(registry);
  documentAuthRoutes(registry);
  documentUserRoutes(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Controle de Acesso API',
      version: '0.1.0',
      description:
        'API do Sistema Integrado de Controle de Acesso (ABP 4º DSM 2026-2). ' +
        'Toda decisão de liberar ou negar acesso é tomada aqui.',
    },
    servers: [{ url: '/api/v1' }],
  });
}
