import { AuthorizationStatus } from '../generated/prisma/enums.js';
import type { DateOnly } from './local-time.js';

/**
 * Situação de uma autorização vista por quem usa o app, calculada a partir do status
 * gravado, do período e dos usos. Não é gravada: muda sozinha com o passar dos dias.
 */
export const AUTHORIZATION_SITUATIONS = [
  'VALID',
  'SCHEDULED',
  'EXPIRED',
  'EXHAUSTED',
  'CANCELLED',
] as const;
export type AuthorizationSituation = (typeof AUTHORIZATION_SITUATIONS)[number];

export interface SituationInput {
  status: AuthorizationStatus;
  startDate: DateOnly;
  endDate: DateOnly;
  maxUses: number | null;
  usesCount: number;
}

/**
 * Prioridade: cancelada › vencida › ainda não começou › usos esgotados › válida.
 * A janela de horário não entra: "fora do horário agora" não muda a situação do dia.
 */
export function situationOf(a: SituationInput, today: DateOnly): AuthorizationSituation {
  if (a.status === AuthorizationStatus.CANCELLED) return 'CANCELLED';
  if (a.endDate < today) return 'EXPIRED';
  if (a.startDate > today) return 'SCHEDULED';
  if (a.maxUses !== null && a.usesCount >= a.maxUses) return 'EXHAUSTED';
  return 'VALID';
}
