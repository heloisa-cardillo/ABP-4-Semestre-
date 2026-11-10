import { z } from 'zod';
import { isValidTimeZone } from '../services/local-time.js';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** Texto opcional em que vazio (`MQTT_URL=` no .env) conta como não informado. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

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

  /** Fuso do edifício. Datas e horários das autorizações são sempre no horário local dele. */
  BUILDING_TIMEZONE: z
    .string()
    .default('America/Sao_Paulo')
    .refine(isValidTimeZone, 'fuso inválido (use um nome IANA, ex.: America/Sao_Paulo)'),
  /** Validade de cada QR Code exibido pelo terminal. O terminal pede um novo nesse intervalo. */
  QR_CODE_TTL_SECONDS: z.coerce.number().int().min(5).max(120).default(10),

  /** Leituras de tag NFC por terminal, por minuto (contra força bruta de UIDs). */
  TERMINAL_ACCESS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),

  /**
   * Broker MQTT para avisar a catraca da decisão (ex.: mqtt://127.0.0.1:1883).
   * Vazio = aviso desligado: o terminal só recebe a resposta das chamadas que ele mesmo faz.
   */
  MQTT_URL: optionalText.pipe(
    z
      .string()
      .regex(/^(mqtts?|wss?):\/\//, 'deve ser uma URL mqtt://, mqtts://, ws:// ou wss://')
      .optional(),
  ),
  MQTT_USERNAME: optionalText,
  MQTT_PASSWORD: optionalText,

  /** Versão exibida em /health. Se vazio, usa o commit que o Render injeta (RENDER_GIT_COMMIT). */
  APP_VERSION: z.string().trim().min(1).optional(),
  RENDER_GIT_COMMIT: z.string().trim().min(1).optional(),
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
