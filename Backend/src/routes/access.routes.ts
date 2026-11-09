import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { accessController } from '../controllers/access.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { authenticateTerminal } from '../middlewares/authenticate-terminal.js';
import { terminalRateLimit } from '../middlewares/rate-limit.js';
import { nfcAccessSchema, terminalAccessDecisionSchema } from '../models/access.schemas.js';

/** Acesso por tag NFC: o terminal lê a tag e pergunta à API (US8). */
export function accessRoutes({ services, env }: AppContainer): Router {
  const router = Router();
  const controller = accessController(services.access);

  router.post(
    '/access/nfc',
    authenticateTerminal(services.terminals),
    terminalRateLimit(env.TERMINAL_ACCESS_RATE_LIMIT_MAX),
    controller.nfc,
  );

  return router;
}

export function documentAccessRoutes(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/access/nfc',
    tags: ['Acesso'],
    summary: 'O terminal envia o UID da tag NFC lida',
    description:
      'Chamado pelo dispositivo com `Authorization: Terminal <credential>`. ' +
      'A resposta é sempre **200** quando o UID tem formato válido: abra a catraca **somente** se `result` for `GRANTED` e mostre `message` no display. ' +
      '`denyReason` diz o motivo da negação (tag desconhecida = `UNKNOWN_USER`). Toda leitura é registrada no histórico. ' +
      'Limite de 60 leituras por minuto por terminal (`TERMINAL_ACCESS_RATE_LIMIT_MAX`).',
    security: [{ terminalAuth: [] }],
    request: { body: json(nfcAccessSchema) },
    responses: {
      200: { description: 'Decisão', ...json(terminalAccessDecisionSchema) },
      400: errorResponse('UID ausente ou mal formado'),
      401: errorResponse('Credencial do terminal ausente, inválida ou de terminal desativado'),
      429: errorResponse('Leituras demais deste terminal no último minuto'),
    },
  });
}
