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

const nameSchema = z.string().trim().min(2, 'Informe o nome.').max(120);

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?\d{10,15}$/, 'Telefone com DDD, só números (ex.: 12988887777).');

export const createUserSchema = z
  .strictObject({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema,
    phone: phoneSchema.optional(),
  })
  .meta({ id: 'CreateUserInput' });

export const updateUserSchema = z
  .strictObject({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    role: roleSchema.optional(),
    phone: phoneSchema.nullable().optional(),
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
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
