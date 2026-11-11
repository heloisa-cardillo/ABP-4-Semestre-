import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { accessEventController } from '../controllers/access-event.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { Role } from '../generated/prisma/enums.js';
import { authenticate, requireRole } from '../middlewares/authenticate.js';
import {
  listAccessEventsQuerySchema,
  listMyAccessEventsQuerySchema,
  publicAccessEventSchema,
} from '../models/access-event.schemas.js';
import { paginatedSchema } from '../models/common.schemas.js';

/** Histórico de tentativas de acesso (US10): completo para o administrador, o próprio para os demais. */
export function accessEventRoutes({ services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = accessEventController(services.accessHistory);

  router.get('/access-events', authenticate(tokens), requireRole(Role.ADMIN), controller.list);
  router.get('/me/access-events', authenticate(tokens), controller.listMine);

  return router;
}

export function documentAccessEventRoutes(registry: OpenAPIRegistry): void {
  const common = { tags: ['Histórico de acessos'], security: [{ bearerAuth: [] }] };
  const page = {
    description: 'Página de tentativas, da mais recente para a mais antiga',
    ...json(paginatedSchema(publicAccessEventSchema)),
  };

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/access-events',
    summary: 'Histórico de todas as tentativas de acesso',
    description:
      'Tentativas liberadas e negadas, por QR e por NFC. Filtros por pessoa, local ' +
      '(inclui tudo abaixo dele), terminal, método, resultado e período. ' +
      '`from` e `to` são dias do calendário no fuso do edifício, os dois inclusive.',
    request: { query: listAccessEventsQuerySchema },
    responses: {
      200: page,
      400: errorResponse('Filtro inválido'),
      401: errorResponse('Sem token ou token inválido'),
      403: errorResponse('Somente administrador'),
    },
  });

  registry.registerPath({
    ...common,
    method: 'get',
    path: '/me/access-events',
    summary: 'Minhas tentativas de acesso (pessoa logada)',
    request: { query: listMyAccessEventsQuerySchema },
    responses: {
      200: page,
      400: errorResponse('Filtro inválido'),
      401: errorResponse('Sem token ou token inválido'),
    },
  });
}
