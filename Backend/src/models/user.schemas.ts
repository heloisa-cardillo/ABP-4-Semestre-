import { z } from 'zod';
import type { User } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { paginationQuerySchema } from './common.schemas.js';

export const roleSchema = z.enum(Role).meta({
  id: 'Role',
  description: 'ADMIN = administrador, RESIDENT = condômino, VISITOR = visitante',
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('E-mail inválido.').max(254));

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.');

export const nameSchema = z.string().trim().min(2, 'Informe o nome.').max(120);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?\d{10,15}$/, 'Telefone com DDD, só números (ex.: 12988887777).');

/**
 * UID da tag NFC lida pelo PN532 (4, 7 ou 10 bytes).
 * Aceita "04:A1:B2:C3", "04 a1 b2 c3" ou "04A1B2C3" e grava "04A1B2C3".
 */
export const nfcUidSchema = z
  .string()
  .transform((v) => v.replace(/[\s:-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/, 'UID de tag NFC inválido.'))
  .meta({
    description: 'UID da tag NFC em hexadecimal (4, 7 ou 10 bytes). Separadores são ignorados.',
    example: '04A1B2C3',
  });

export const createUserSchema = z
  .strictObject({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema,
    phone: phoneSchema.optional(),
    nfcUid: nfcUidSchema.optional(),
  })
  .meta({ id: 'CreateUserInput' });

export const updateUserSchema = z
  .strictObject({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    role: roleSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    /** `null` desvincula a tag. */
    nfcUid: nfcUidSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Informe ao menos um campo para alterar.')
  .meta({ id: 'UpdateUserInput' });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: roleSchema.optional(),
  active: z.stringbool().optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const publicUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: roleSchema,
    phone: z.string().nullable(),
    nfcUid: z.string().nullable().meta({ description: 'UID da tag NFC vinculada, se houver.' }),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;

/** O que sai da API sobre um usuário. O hash da senha nunca sai. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    nfcUid: user.nfcUid,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
