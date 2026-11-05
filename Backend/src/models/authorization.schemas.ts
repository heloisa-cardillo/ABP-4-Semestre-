import { z } from 'zod';
import type { Authorization, Location, User } from '../generated/prisma/client.js';
import { AuthorizationStatus } from '../generated/prisma/enums.js';
import { AUTHORIZATION_SITUATIONS, situationOf } from '../services/authorization-rules.js';
import { dateFromDb, timeFromDb, type DateOnly } from '../services/local-time.js';
import { paginationQuerySchema } from './common.schemas.js';
import { locationTypeSchema } from './location.schemas.js';
import {
  emailSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  roleSchema,
} from './user.schemas.js';

/** Dia inteiro: valores usados quando a autorização não informa janela de horário. */
export const FULL_DAY = { startTime: '00:00:00', endTime: '23:59:59' } as const;

const dateSchema = z.iso.date('Data no formato AAAA-MM-DD.').meta({ example: '2026-11-10' });

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Horário no formato HH:mm.')
  .transform((value) => (value.length === 5 ? `${value}:00` : value))
  .meta({ example: '08:00', description: 'Horário local do edifício (HH:mm ou HH:mm:ss).' });

export const situationSchema = z.enum(AUTHORIZATION_SITUATIONS).meta({
  id: 'AuthorizationSituation',
  description:
    'VALID = vale hoje, SCHEDULED = ainda não começou, EXPIRED = período terminou, EXHAUSTED = usos esgotados, CANCELLED = cancelada',
});

const visitorSchema = z
  .strictObject({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema.optional(),
  })
  .meta({
    id: 'NewVisitorInput',
    description: 'Visitante que ainda não tem cadastro. É criado com perfil VISITOR.',
  });

export const createAuthorizationSchema = z
  .strictObject({
    userId: z
      .uuid()
      .optional()
      .meta({ description: 'Pessoa já cadastrada. Use isto ou `visitor`.' }),
    visitor: visitorSchema.optional(),
    locationId: z.uuid().meta({
      description: 'Local liberado. Vale também para tudo abaixo dele (ex.: edifício inteiro).',
    }),
    startDate: dateSchema,
    endDate: dateSchema,
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    maxUses: z
      .int()
      .min(1, 'Informe ao menos 1 utilização.')
      .max(10_000)
      .nullable()
      .optional()
      .meta({ description: 'Quantas vezes pode passar. Vazio ou nulo = sem limite.' }),
  })
  .refine((input) => (input.userId === undefined) !== (input.visitor === undefined), {
    message: 'Informe `userId` (pessoa já cadastrada) ou `visitor` (visitante novo), um dos dois.',
    path: ['userId'],
  })
  .refine((input) => input.endDate >= input.startDate, {
    message: 'A data de término não pode ser antes da data de início.',
    path: ['endDate'],
  })
  .refine(
    (input) => (input.endTime ?? FULL_DAY.endTime) > (input.startTime ?? FULL_DAY.startTime),
    { message: 'O horário final precisa ser depois do inicial.', path: ['endTime'] },
  )
  .meta({ id: 'CreateAuthorizationInput' });

export const cancelAuthorizationSchema = z
  .strictObject({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .meta({ id: 'CancelAuthorizationInput' });

const periodQuery = {
  from: dateSchema.optional().meta({ description: 'Início do período procurado.' }),
  to: dateSchema.optional().meta({ description: 'Fim do período procurado.' }),
  situation: situationSchema.optional(),
};
const periodInOrder = (q: { from?: string | undefined; to?: string | undefined }) =>
  !q.from || !q.to || q.from <= q.to;
const periodMessage = { message: '`from` não pode ser depois de `to`.', path: ['from'] };

export const listAuthorizationsQuerySchema = paginationQuerySchema
  .extend({
    userId: z.uuid().optional(),
    locationId: z.uuid().optional(),
    ...periodQuery,
  })
  .refine(periodInOrder, periodMessage);

export const listMyAuthorizationsQuerySchema = paginationQuerySchema
  .extend(periodQuery)
  .refine(periodInOrder, periodMessage);

export const publicAuthorizationSchema = z
  .object({
    id: z.uuid(),
    user: z.object({ id: z.uuid(), name: z.string(), role: roleSchema }),
    location: z.object({ id: z.uuid(), name: z.string(), type: locationTypeSchema }),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    startTime: z.string().meta({ example: '08:00:00' }),
    endTime: z.string().meta({ example: '18:00:00' }),
    maxUses: z.number().int().nullable(),
    usesCount: z.number().int(),
    status: z.enum(AuthorizationStatus),
    situation: situationSchema,
    createdById: z.uuid(),
    cancelledAt: z.iso.datetime().nullable(),
    cancelledById: z.uuid().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Authorization' });

export type CreateAuthorizationInput = z.infer<typeof createAuthorizationSchema>;
export type CancelAuthorizationInput = z.infer<typeof cancelAuthorizationSchema>;
export type ListAuthorizationsQuery = z.infer<typeof listAuthorizationsQuerySchema>;
export type ListMyAuthorizationsQuery = z.infer<typeof listMyAuthorizationsQuerySchema>;
export type PublicAuthorization = z.infer<typeof publicAuthorizationSchema>;

export type AuthorizationDetails = Authorization & {
  user: Pick<User, 'id' | 'name' | 'role'>;
  location: Pick<Location, 'id' | 'name' | 'type'>;
};

/** O que sai da API sobre uma autorização. `today` é a data no fuso do edifício. */
export function toPublicAuthorization(
  a: AuthorizationDetails,
  today: DateOnly,
): PublicAuthorization {
  const startDate = dateFromDb(a.startDate);
  const endDate = dateFromDb(a.endDate);
  return {
    id: a.id,
    user: { id: a.user.id, name: a.user.name, role: a.user.role },
    location: { id: a.location.id, name: a.location.name, type: a.location.type },
    startDate,
    endDate,
    startTime: timeFromDb(a.startTime),
    endTime: timeFromDb(a.endTime),
    maxUses: a.maxUses,
    usesCount: a.usesCount,
    status: a.status,
    situation: situationOf(
      { status: a.status, startDate, endDate, maxUses: a.maxUses, usesCount: a.usesCount },
      today,
    ),
    createdById: a.createdById,
    cancelledAt: a.cancelledAt?.toISOString() ?? null,
    cancelledById: a.cancelledById,
    cancelReason: a.cancelReason,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
