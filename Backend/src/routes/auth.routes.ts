import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { authController } from '../controllers/auth.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { authenticate } from '../middlewares/authenticate.js';
import { loginRateLimit, sessionRateLimit } from '../middlewares/rate-limit.js';
import { loginSchema, refreshTokenSchema, sessionSchema } from '../models/auth.schemas.js';
import { publicUserSchema } from '../models/user.schemas.js';

export function authRoutes({ env, services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = authController(services.auth, services.users);

  router.post('/auth/login', loginRateLimit(env.AUTH_RATE_LIMIT_MAX), controller.login);
  const sessionLimit = sessionRateLimit(env.SESSION_RATE_LIMIT_MAX);
  router.post('/auth/refresh', sessionLimit, controller.refresh);
  router.post('/auth/logout', sessionLimit, controller.logout);
  router.get('/auth/me', authenticate(tokens), controller.me);

  return router;
}

export function documentAuthRoutes(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['Autenticação'],
    summary: 'Entra com e-mail e senha',
    description: 'Limitado a 10 tentativas por IP e e-mail a cada 15 minutos.',
    request: { body: json(loginSchema) },
    responses: {
      200: { description: 'Sessão criada', ...json(sessionSchema) },
      400: errorResponse('Dados inválidos'),
      401: errorResponse('E-mail ou senha incorretos (INVALID_CREDENTIALS)'),
      429: errorResponse('Muitas tentativas (TOO_MANY_REQUESTS)'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    tags: ['Autenticação'],
    summary: 'Renova a sessão',
    description:
      'Troca o refresh token por uma sessão nova. O token enviado deixa de valer; reenviá-lo encerra a sessão (REFRESH_TOKEN_REUSED). O app deve fazer uma renovação por vez. Limitado a 100 chamadas (renovação + logout) por IP a cada 15 minutos.',
    request: { body: json(refreshTokenSchema) },
    responses: {
      200: { description: 'Sessão renovada', ...json(sessionSchema) },
      401: errorResponse('Token inválido, expirado ou reutilizado'),
      429: errorResponse('Muitas tentativas (TOO_MANY_REQUESTS)'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    tags: ['Autenticação'],
    summary: 'Encerra a sessão deste aparelho',
    request: { body: json(refreshTokenSchema) },
    responses: {
      204: { description: 'Sessão encerrada' },
      429: errorResponse('Muitas tentativas (TOO_MANY_REQUESTS)'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    tags: ['Autenticação'],
    summary: 'Dados do usuário logado',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Usuário logado', ...json(publicUserSchema) },
      401: errorResponse('Sem token, token inválido (INVALID_TOKEN) ou expirado (TOKEN_EXPIRED)'),
    },
  });
}
