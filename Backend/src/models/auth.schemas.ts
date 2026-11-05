import { z } from 'zod';
import { emailSchema, publicUserSchema } from './user.schemas.js';

export const loginSchema = z
  .strictObject({
    email: emailSchema,
    password: z.string().min(1, 'Informe a senha.').max(128),
  })
  .meta({ id: 'LoginInput' });

export const refreshTokenSchema = z
  .strictObject({
    refreshToken: z.string().min(20).max(200),
  })
  .meta({ id: 'RefreshTokenInput' });

export const sessionSchema = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string().meta({ description: 'JWT de acesso; vai no cabeçalho Authorization.' }),
    expiresIn: z.number().int().meta({ description: 'Segundos até o accessToken expirar.' }),
    refreshToken: z.string().meta({
      description:
        'Token opaco para renovar a sessão. Guardar no armazenamento seguro do aparelho (flutter_secure_storage). Cada renovação devolve um novo; o anterior deixa de valer.',
    }),
    user: publicUserSchema,
  })
  .meta({ id: 'Session' });

export type Session = z.infer<typeof sessionSchema>;
