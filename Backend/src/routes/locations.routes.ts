import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { locationController } from '../controllers/location.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { Role } from '../generated/prisma/enums.js';
import { authenticate, requireRole } from '../middlewares/authenticate.js';
import { idParamSchema, paginatedSchema } from '../models/common.schemas.js';
import {
  createLocationSchema,
  listLocationsQuerySchema,
  publicLocationSchema,
  updateLocationSchema,
} from '../models/location.schemas.js';

/** Cadastro de locais: só administrador (RF02). */
export function locationRoutes({ services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = locationController(services.locations);

  router.use('/locations', authenticate(tokens), requireRole(Role.ADMIN));
  router.post('/locations', controller.create);
  router.get('/locations', controller.list);
  router.get('/locations/:id', controller.get);
  router.patch('/locations/:id', controller.update);
  router.delete('/locations/:id', controller.deactivate);

  return router;
}

export function documentLocationRoutes(registry: OpenAPIRegistry): void {
  const common = { tags: ['Locais'], security: [{ bearerAuth: [] }] };
  const authErrors = {
    401: errorResponse('Sem token ou token inválido'),
    403: errorResponse('Somente administrador'),
  };

  registry.registerPath({
    ...common,
    method: 'post',
    path: '/locations',
    summary: 'Cadastra local (edifício, portaria, porta ou catraca)',
    description:
      'Hierarquia: Edifício › Portaria › Porta › Catraca. Cada local informa o de cima em `parentId` (o edifício não tem). Edifício exige endereço e coordenadas; catraca exige coordenadas.',
    request: { body: json(createLocationSchema) },
    responses: {
      201: { description: 'Local criado', ...json(publicLocationSchema) },
      400: errorResponse('Dados inválidos'),
      ...authErrors,
      422: errorResponse(
        'Regra de hierarquia (INVALID_HIERARCHY, PARENT_NOT_FOUND, PARENT_INACTIVE) ou dado obrigatório do nível (COORDINATES_REQUIRED, ADDRESS_REQUIRED)',
      ),
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/locations',
    summary: 'Lista locais com filtros e paginação',
    description: 'Use `parentId` para descer a árvore um nível por vez.',
    request: { query: listLocationsQuerySchema },
    responses: {
      200: { description: 'Página de locais', ...json(paginatedSchema(publicLocationSchema)) },
      ...authErrors,
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/locations/{id}',
    summary: 'Busca local',
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Local', ...json(publicLocationSchema) },
      ...authErrors,
      404: errorResponse('Local não encontrado'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'patch',
    path: '/locations/{id}',
    summary: 'Altera nome, descrição, endereço ou coordenadas',
    description: 'Tipo e local de cima não mudam.',
    request: { params: idParamSchema, body: json(updateLocationSchema) },
    responses: {
      200: { description: 'Local alterado', ...json(publicLocationSchema) },
      400: errorResponse('Dados inválidos'),
      ...authErrors,
      404: errorResponse('Local não encontrado'),
      422: errorResponse('Remoção de dado obrigatório do nível'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'delete',
    path: '/locations/{id}',
    summary: 'Desativa local',
    description:
      'Não apaga: autorizações e histórico continuam apontando para ele. Exige que os locais de dentro e o terminal já estejam desativados.',
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Local desativado' },
      ...authErrors,
      404: errorResponse('Local não encontrado'),
      409: errorResponse('Há locais ativos dentro dele ou terminal ativo na catraca'),
    },
  });
}
