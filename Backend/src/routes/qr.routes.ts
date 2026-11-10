import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import type { AppContainer } from '../container.js';
import { qrController } from '../controllers/qr.controller.js';
import { errorResponse, json } from '../docs/openapi.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authenticateTerminal } from '../middlewares/authenticate-terminal.js';
import {
  accessDecisionResponseSchema,
  issuedQrCodeSchema,
  redeemQrSchema,
} from '../models/qr.schemas.js';

/** Acesso por QR Code rotativo: o terminal exibe, o app lê e envia (US7). */
export function qrRoutes({ services, tokens }: AppContainer): Router {
  const router = Router();
  const controller = qrController(services.qr);

  router.post('/access/qr/challenge', authenticateTerminal(services.terminals), controller.issue);
  router.post('/access/qr', authenticate(tokens), controller.redeem);

  return router;
}

export function documentQrRoutes(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/access/qr/challenge',
    tags: ['Acesso'],
    summary: 'O terminal pede o próximo QR Code para exibir',
    description:
      'Chamado pelo dispositivo a cada `ttlSeconds` (10 s), com `Authorization: Terminal <credential>`. ' +
      'Exiba `code` como QR Code. Cada código vale uma única vez, até `expiresAt`.',
    security: [{ terminalAuth: [] }],
    responses: {
      201: { description: 'Código novo', ...json(issuedQrCodeSchema) },
      401: errorResponse('Credencial do terminal ausente, inválida ou de terminal desativado'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/access/qr',
    tags: ['Acesso'],
    summary: 'O app envia o QR Code lido no terminal',
    description:
      'Envie o texto lido do QR Code e a posição atual do celular. ' +
      'A resposta é sempre **200** quando o código tem o formato certo: `result` diz se liberou (`GRANTED`) ou negou (`DENIED`), e `denyReason` diz o motivo. ' +
      'Toda leitura é registrada no histórico.',
    security: [{ bearerAuth: [] }],
    request: { body: json(redeemQrSchema) },
    responses: {
      200: { description: 'Decisão', ...json(accessDecisionResponseSchema) },
      400: errorResponse('QR Code que não é de terminal, ou posição ausente ou inválida'),
      401: errorResponse('Sem token ou token inválido'),
    },
  });
}
