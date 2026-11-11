import { z } from 'zod';
import type { AccessEvent, Location, Terminal, User } from '../generated/prisma/client.js';
import { AccessMethod, AccessResult, DenyReason } from '../generated/prisma/enums.js';
import { paginationQuerySchema } from './common.schemas.js';
import { locationTypeSchema } from './location.schemas.js';
import { roleSchema } from './user.schemas.js';

const dateSchema = z.iso.date('Data no formato AAAA-MM-DD.').meta({ example: '2026-11-11' });

export const accessMethodSchema = z.enum(AccessMethod).meta({
  id: 'AccessMethod',
  description: 'QR = QR Code lido pelo app, NFC = tag apresentada ao terminal',
});

export const accessResultSchema = z.enum(AccessResult).meta({
  id: 'AccessResult',
  description: 'GRANTED = liberado, DENIED = negado',
});

export const denyReasonSchema = z.enum(DenyReason).meta({
  id: 'DenyReason',
  description: 'Motivo da negação. Nulo quando o acesso foi liberado.',
});

/** Filtros comuns às duas consultas. Datas são dias do calendário no fuso do edifício. */
const commonFilters = {
  method: accessMethodSchema.optional(),
  result: accessResultSchema.optional(),
  from: dateSchema.optional().meta({ description: 'Primeiro dia (inclusive).' }),
  to: dateSchema.optional().meta({ description: 'Último dia (inclusive).' }),
};
const periodInOrder = (q: { from?: string | undefined; to?: string | undefined }) =>
  !q.from || !q.to || q.from <= q.to;
const periodMessage = { message: '`from` não pode ser depois de `to`.', path: ['from'] };

export const listAccessEventsQuerySchema = paginationQuerySchema
  .extend({
    userId: z.uuid().optional(),
    locationId: z
      .uuid()
      .optional()
      .meta({ description: 'Local filtrado. Inclui tudo abaixo dele (ex.: o edifício inteiro).' }),
    terminalId: z.uuid().optional(),
    ...commonFilters,
  })
  .refine(periodInOrder, periodMessage);

/** Estrito: a pessoa não pode pedir o histórico de outra trocando o `userId`. */
export const listMyAccessEventsQuerySchema = paginationQuerySchema
  .extend(commonFilters)
  .strict()
  .refine(periodInOrder, periodMessage);

export const publicAccessEventSchema = z
  .object({
    id: z.uuid(),
    occurredAt: z.iso.datetime(),
    method: accessMethodSchema,
    result: accessResultSchema,
    denyReason: denyReasonSchema.nullable(),
    user: z
      .object({ id: z.uuid(), name: z.string(), role: roleSchema })
      .nullable()
      .meta({ description: 'Nulo quando a credencial não identificou ninguém.' }),
    location: z.object({ id: z.uuid(), name: z.string(), type: locationTypeSchema }).nullable(),
    terminal: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    authorizationId: z.uuid().nullable(),
    credential: z
      .string()
      .nullable()
      .meta({ description: 'UID da tag NFC ou identificação do QR apresentado.' }),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    distanceMeters: z
      .number()
      .nullable()
      .meta({ description: 'Distância do celular até a catraca na leitura do QR.' }),
  })
  .meta({ id: 'AccessEvent' });

export type ListAccessEventsQuery = z.infer<typeof listAccessEventsQuerySchema>;
export type ListMyAccessEventsQuery = z.infer<typeof listMyAccessEventsQuerySchema>;
export type PublicAccessEvent = z.infer<typeof publicAccessEventSchema>;

export type AccessEventDetails = AccessEvent & {
  user: Pick<User, 'id' | 'name' | 'role'> | null;
  location: Pick<Location, 'id' | 'name' | 'type'> | null;
  terminal: Pick<Terminal, 'id' | 'name'> | null;
};

/** O que sai da API sobre uma tentativa de acesso. */
export function toPublicAccessEvent(e: AccessEventDetails): PublicAccessEvent {
  return {
    id: e.id,
    occurredAt: e.occurredAt.toISOString(),
    method: e.method,
    result: e.result,
    denyReason: e.denyReason,
    user: e.user && { id: e.user.id, name: e.user.name, role: e.user.role },
    location: e.location && { id: e.location.id, name: e.location.name, type: e.location.type },
    terminal: e.terminal && { id: e.terminal.id, name: e.terminal.name },
    authorizationId: e.authorizationId,
    credential: e.credential,
    latitude: e.latitude,
    longitude: e.longitude,
    distanceMeters: e.distanceMeters,
  };
}
