import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { terminalController } from '../controllers/terminal.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { Role } from '../generated/prisma/enums.js';
import { authenticate, requireRole } from '../middlewares/authenticate.js';
import { authenticateTerminal } from '../middlewares/authenticate-terminal.js';
import { idParamSchema, paginatedSchema } from '../models/common.schemas.js';
import {
  createTerminalSchema,
  listTerminalsQuerySchema,
  publicTerminalSchema,
  terminalSelfSchema,
  terminalWithCredentialSchema,
  updateTerminalSchema,
} from '../models/terminal.schemas.js';

/** Cadastro de terminais (administrador) e identificação do próprio terminal (dispositivo). */
export function terminalRoutes({ services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = terminalController(services.terminals);
  const admin = [authenticate(tokens), requireRole(Role.ADMIN)];

  // Antes de `/terminals/:id`, e autenticada pela credencial do dispositivo, não por JWT.
  router.get('/terminals/me', authenticateTerminal(services.terminals), controller.me);

  router.post('/terminals', admin, controller.create);
  router.get('/terminals', admin, controller.list);
  router.get('/terminals/:id', admin, controller.get);
  router.patch('/terminals/:id', admin, controller.update);
  router.delete('/terminals/:id', admin, controller.deactivate);
  router.post('/terminals/:id/credential', admin, controller.rotateCredential);

  return router;
}

export function documentTerminalRoutes(registry: OpenAPIRegistry): void {
  const common = { tags: ['Terminais'], security: [{ bearerAuth: [] }] };
  const authErrors = {
    401: errorResponse('Sem token ou token inválido'),
    403: errorResponse('Somente administrador'),
  };

  registry.registerPath({
    ...common,
    method: 'post',
    path: '/terminals',
    summary: 'Cadastra terminal numa catraca e gera a credencial do dispositivo',
    request: { body: json(createTerminalSchema) },
    responses: {
      201: {
        description: 'Terminal criado. Guarde a credencial: ela não é mostrada de novo.',
        ...json(terminalWithCredentialSchema),
      },
      400: errorResponse('Dados inválidos'),
      ...authErrors,
      409: errorResponse('A catraca já tem terminal (TURNSTILE_HAS_TERMINAL)'),
      422: errorResponse('Local inexistente, desativado ou que não é catraca'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/terminals',
    summary: 'Lista terminais',
    request: { query: listTerminalsQuerySchema },
    responses: {
      200: { description: 'Página de terminais', ...json(paginatedSchema(publicTerminalSchema)) },
      ...authErrors,
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/terminals/{id}',
    summary: 'Busca terminal',
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Terminal', ...json(publicTerminalSchema) },
      ...authErrors,
      404: errorResponse('Terminal não encontrado'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'patch',
    path: '/terminals/{id}',
    summary: 'Renomeia, desativa ou reativa terminal',
    request: { params: idParamSchema, body: json(updateTerminalSchema) },
    responses: {
      200: { description: 'Terminal alterado', ...json(publicTerminalSchema) },
      400: errorResponse('Dados inválidos'),
      ...authErrors,
      404: errorResponse('Terminal não encontrado'),
      422: errorResponse('Reativação numa catraca desativada'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'delete',
    path: '/terminals/{id}',
    summary: 'Desativa terminal',
    request: { params: idParamSchema },
    responses: {
      204: { description: 'Terminal desativado' },
      ...authErrors,
      404: errorResponse('Terminal não encontrado'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'post',
    path: '/terminals/{id}/credential',
    summary: 'Gera nova credencial do dispositivo',
    description: 'A credencial anterior deixa de valer na hora (ex.: terminal extraviado).',
    request: { params: idParamSchema },
    responses: {
      200: { description: 'Nova credencial', ...json(terminalWithCredentialSchema) },
      ...authErrors,
      404: errorResponse('Terminal não encontrado'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/terminals/me',
    tags: ['Terminais'],
    summary: 'O terminal confere a própria credencial',
    description:
      'Chamado pelo dispositivo, com `Authorization: Terminal <credential>`. Devolve onde ele está instalado e registra a hora em que foi visto.',
    security: [{ terminalAuth: [] }],
    responses: {
      200: { description: 'Terminal autenticado', ...json(terminalSelfSchema) },
      401: errorResponse('Credencial ausente, inválida ou de terminal desativado'),
    },
  });
}
