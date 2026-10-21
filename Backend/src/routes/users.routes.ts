import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { userController } from '../controllers/user.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { Role } from '../generated/prisma/enums.js';
import { authenticate, requireRole } from '../middlewares/authenticate.js';
import { idParamSchema, paginatedSchema } from '../models/common.schemas.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  publicUserSchema,
  updateUserSchema,
} from '../models/user.schemas.js';

/** Cadastro de usuários: só administrador (RF01). */
export function userRoutes({ services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = userController(services.users);

  router.use('/users', authenticate(tokens), requireRole(Role.ADMIN));
  router.post('/users', controller.create);
  router.get('/users', controller.list);
  router.get('/users/:id', controller.get);
  router.patch('/users/:id', controller.update);
  router.delete('/users/:id', controller.deactivate);

  return router;
}

export function documentUserRoutes(registry: OpenAPIRegistry): void {
  const common = {
    tags: ['Usuários'],
    security: [{ bearerAuth: [] }],
  };
  const authErrors = {
    401: errorResponse('Sem token ou token inválido'),
    403: errorResponse('Somente administrador'),
  };

  registry.registerPath({
    ...common,
    method: 'post',
    path: '/users',
    summary: 'Cadastra usuário (administrador, condômino ou visitante)',
    request: { body: json(createUserSchema) },
    responses: {
      201: { description: 'Usuário criado', ...json(publicUserSchema) },
      400: errorResponse('Dados inválidos'),
      ...authErrors,
      409: errorResponse('E-mail já cadastrado (EMAIL_IN_USE)'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/users',
    summary: 'Lista usuários com filtros e paginação',
    request: { query: listUsersQuerySchema },
    responses: {
      200: { description: 'Página de usuários', ...json(paginatedSchema(publicUserSchema)) },
      ...authErrors,
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/users/{id}',
    summary: 'Busca usuário',
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Usuário', ...json(publicUserSchema) },
      ...authErrors,
      404: errorResponse('Usuário não encontrado'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'patch',
    path: '/users/{id}',
    summary: 'Altera usuário',
    description:
      'Trocar senha, trocar perfil ou desativar encerra as sessões abertas do usuário. O administrador não pode se desativar nem tirar o próprio perfil (SELF_LOCKOUT).',
    request: { params: idParamSchema, body: json(updateUserSchema) },
    responses: {
      200: { description: 'Usuário alterado', ...json(publicUserSchema) },
      400: errorResponse('Dados inválidos'),
      ...authErrors,
      404: errorResponse('Usuário não encontrado'),
      409: errorResponse('E-mail já cadastrado ou tentativa de se bloquear'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'delete',
    path: '/users/{id}',
    summary: 'Desativa usuário',
    description: 'Não apaga: o histórico de acessos continua apontando para ele.',
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Usuário desativado' },
      ...authErrors,
      404: errorResponse('Usuário não encontrado'),
      409: errorResponse('Tentativa de desativar a própria conta (SELF_LOCKOUT)'),
    },
  });
}
