import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';

const env = loadEnv();
const logger = createLogger(env);
const app = createApp({ env, logger });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API no ar');
});

/** Encerramento gracioso: para de aceitar conexões e espera as requisições em andamento. */
function shutdown(signal: string): void {
  logger.info({ signal }, 'encerrando');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'falha ao encerrar o servidor HTTP');
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
