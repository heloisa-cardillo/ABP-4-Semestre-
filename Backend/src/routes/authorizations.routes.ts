import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { authorizationController } from '../controllers/authorization.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { Role } from '../generated/prisma/enums.js';
import { authenticate, requireRole } from '../middlewares/authenticate.js';
import {
  cancelAuthorizationSchema,
  createAuthorizationSchema,
  listAuthorizationsQuerySchema,
  listMyAuthorizationsQuerySchema,
  publicAuthorizationSchema,
} from '../models/authorization.schemas.js';
import { idParamSchema, paginatedSchema } from '../models/common.schemas.js';

/** Gestão de autorizações (administrador) e consulta das próprias autorizações (qualquer perfil). */
export function authorizationRoutes({ services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = authorizationController(services.authorizations);
  const admin = [authenticate(tokens), requireRole(Role.ADMIN)];

  router.get('/me/authorizations', authenticate(tokens), controller.listMine);

  router.post('/authorizations', admin, controller.create);
  router.get('/authorizations', admin, controller.list);
  router.get('/authorizations/:id', admin, controller.get);
  router.post('/authorizations/:id/cancel', admin, controller.cancel);

  return router;
}

export function documentAuthorizationRoutes(registry: OpenAPIRegistry): void {
  const common = { tags: ['Autorizações'], security: [{ bearerAuth: [] }] };
  const authErrors = {
    401: errorResponse('Sem token ou token inválido'),
    403: errorResponse('Somente administrador'),
  };
  const page = {
    description: 'Página de autorizações',
    ...json(paginatedSchema(publicAuthorizationSchema)),
  };

  registry.registerPath({
    ...common,
    method: 'post',
    path: '/authorizations',
    summary: 'Cria autorização de acesso',
    description:
      'Informe `userId` para quem já tem cadastro ou `visitor` para cadastrar um visitante novo junto. ' +
      'A autorização vale para o local indicado e para tudo abaixo dele. ' +
      'Sem `startTime`/`endTime` vale o dia inteiro; sem `maxUses` não tem limite de usos.',
    request: { body: json(createAuthorizationSchema) },
    responses: {
      201: { description: 'Autorização criada', ...json(publicAuthorizationSchema) },
      400: errorResponse('Dados inválidos (formato, datas ou horários fora de ordem)'),
      ...authErrors,
      409: errorResponse('E-mail do visitante já cadastrado (EMAIL_IN_USE)'),
      422: errorResponse(
        'END_DATE_IN_PAST, USER_NOT_FOUND, USER_INACTIVE, LOCATION_NOT_FOUND ou LOCATION_INACTIVE',
      ),
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/authorizations',
    summary: 'Lista autorizações com filtros e paginação',
    description:
      'Filtros por pessoa, local, período (`from`/`to`: traz as que têm algum dia no intervalo) e situação.',
    request: { query: listAuthorizationsQuerySchema },
    responses: { 200: page, 400: errorResponse('Filtro inválido'), ...authErrors },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/authorizations/{id}',
    summary: 'Busca autorização',
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Autorização', ...json(publicAuthorizationSchema) },
      ...authErrors,
      404: errorResponse('Autorização não encontrada'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'post',
    path: '/authorizations/{id}/cancel',
    summary: 'Cancela autorização',
    description:
      'O motivo é opcional. Autorização não se apaga: o histórico de acessos aponta para ela.',
    request: { params: idParamSchema, body: json(cancelAuthorizationSchema) },
    responses: {
      200: { description: 'Autorização cancelada', ...json(publicAuthorizationSchema) },
      ...authErrors,
      404: errorResponse('Autorização não encontrada'),
      409: errorResponse('Já estava cancelada (ALREADY_CANCELLED)'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/me/authorizations',
    tags: ['Autorizações'],
    security: [{ bearerAuth: [] }],
    summary: 'Minhas autorizações (condômino ou visitante logado)',
    request: { query: listMyAuthorizationsQuerySchema },
    responses: {
      200: page,
      400: errorResponse('Filtro inválido'),
      401: errorResponse('Sem token ou token inválido'),
    },
  });
}
