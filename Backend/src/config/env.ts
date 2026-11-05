import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Origens liberadas no CORS, separadas por vírgula. Vazio = nenhuma origem de navegador. */
  CORS_ORIGINS: csv,
  /** Quantidade de proxies confiáveis à frente da API (ex.: 1 atrás do load balancer da nuvem). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'deve ser uma URL de conexão postgresql://'),

  /** Segredo de assinatura do JWT de acesso (HS256). */
  JWT_SECRET: z.string().min(32, 'use ao menos 32 caracteres aleatórios'),
  /** Vida do JWT de acesso. Curta de propósito: a sessão longa é o refresh token, que pode ser revogado. */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Tentativas de login por IP e e-mail a cada 15 minutos. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  /** Renovações e logouts por IP a cada 15 minutos. Folgado: uma turma inteira pode sair pelo mesmo IP. */
  SESSION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Lê e valida as variáveis de ambiente uma única vez, na subida.
 * Configuração inválida derruba o processo com a lista do que está errado,
 * em vez de falhar no meio de uma requisição.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}
