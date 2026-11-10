import { z } from 'zod';
import { AccessResult, DenyReason } from '../generated/prisma/enums.js';
import type { AccessDecision } from '../services/access-decision.js';
import { nfcUidSchema } from './user.schemas.js';

/** O terminal leu uma tag NFC (US8). */
export const nfcAccessSchema = z
  .strictObject({
    uid: nfcUidSchema,
  })
  .meta({ id: 'NfcAccessInput' });

/**
 * Resposta para o terminal. Acesso negado não é erro HTTP: vem 200 com `DENIED`.
 * Para o dispositivo não sai id nem dado pessoal: só o primeiro nome, para o display.
 */
export const terminalAccessDecisionSchema = z
  .object({
    result: z.enum(AccessResult).meta({ description: 'Abra a catraca só se for GRANTED.' }),
    denyReason: z.enum(DenyReason).nullable(),
    message: z.string().meta({
      description: 'Texto para o display: até 16 caracteres, sem acento.',
      example: 'Acesso liberado',
    }),
    eventId: z.uuid(),
    user: z.object({ name: z.string().meta({ example: 'Ana' }) }).nullable(),
  })
  .meta({ id: 'TerminalAccessDecision' });

export type NfcAccessInput = z.infer<typeof nfcAccessSchema>;

export function toTerminalAccessDecision(
  decision: AccessDecision,
): z.infer<typeof terminalAccessDecisionSchema> {
  const firstName = decision.user?.name.trim().split(/\s+/)[0];
  return {
    result: decision.result,
    denyReason: decision.denyReason,
    message: decision.message,
    eventId: decision.eventId,
    user: firstName ? { name: firstName } : null,
  };
}
