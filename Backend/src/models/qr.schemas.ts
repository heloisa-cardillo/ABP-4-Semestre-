import { z } from 'zod';
import { AccessResult, DenyReason } from '../generated/prisma/enums.js';
import type { AccessDecision } from '../services/access-decision.js';
import { parseQrCode, QR_CODE_PATTERN } from '../services/qr-code-format.js';
import type { IssuedQrCode } from '../services/qr-code.service.js';

export const issuedQrCodeSchema = z
  .object({
    code: z.string().meta({
      description:
        'Conteúdo a exibir no QR Code (45 caracteres, cabe num QR versão 3). Vale uma vez só, até `expiresAt`.',
      example: 'AaHMFDvFdGe4S6k-RuOVOA.Xq3v9Lr2mT8wYc1KpZ0eNg',
    }),
    expiresAt: z.iso.datetime(),
    ttlSeconds: z
      .number()
      .int()
      .meta({ description: 'Peça um código novo a cada intervalo destes.' }),
  })
  .meta({ id: 'IssuedQrCode' });

export const redeemQrSchema = z
  .strictObject({
    code: z
      .string()
      .regex(QR_CODE_PATTERN, 'Este QR Code não é de um terminal de acesso.')
      .refine((code) => parseQrCode(code) !== null, 'Este QR Code não é de um terminal de acesso.')
      .meta({
        description: 'Texto lido do QR Code do terminal, sem alterar.',
        example: 'AaHMFDvFdGe4S6k-RuOVOA.Xq3v9Lr2mT8wYc1KpZ0eNg',
      }),
    latitude: z.number().min(-90).max(90).meta({ example: -23.30501 }),
    longitude: z.number().min(-180).max(180).meta({ example: -45.96581 }),
  })
  .meta({ id: 'RedeemQrInput' });

/** Resposta de uma tentativa de acesso. Acesso negado não é erro HTTP: vem 200 com `DENIED`. */
export const accessDecisionResponseSchema = z
  .object({
    result: z.enum(AccessResult),
    denyReason: z.enum(DenyReason).nullable(),
    message: z.string().meta({ example: 'Acesso liberado' }),
    eventId: z.uuid(),
    distanceMeters: z.number().nullable(),
  })
  .meta({ id: 'AccessDecision' });

export type RedeemQrInput = z.infer<typeof redeemQrSchema>;

export function toIssuedQrCode(issued: IssuedQrCode): z.infer<typeof issuedQrCodeSchema> {
  return {
    code: issued.code,
    expiresAt: issued.expiresAt.toISOString(),
    ttlSeconds: issued.ttlSeconds,
  };
}

/** Para o app não sai o id da pessoa nem da autorização: só o que a tela de resultado mostra. */
export function toAccessDecisionResponse(
  decision: AccessDecision,
): z.infer<typeof accessDecisionResponseSchema> {
  return {
    result: decision.result,
    denyReason: decision.denyReason,
    message: decision.message,
    eventId: decision.eventId,
    distanceMeters: decision.distanceMeters,
  };
}
