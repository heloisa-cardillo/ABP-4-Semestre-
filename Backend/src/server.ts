import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createContainer } from './container.js';

const env = loadEnv();
const logger = createLogger(env);
const container = createContainer(env, logger);
const app = createApp(container);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API no ar');
});

/** Encerramento gracioso: para de aceitar conexões, espera as requisições em andamento e fecha o banco. */
function shutdown(signal: string): void {
  logger.info({ signal }, 'encerrando');
  server.close((err) => {
    container.prisma
      .$disconnect()
      .catch((dbErr: unknown) => {
        logger.error({ err: dbErr }, 'falha ao fechar a conexão com o banco');
      })
      .finally(() => {
        if (err) logger.error({ err }, 'falha ao encerrar o servidor HTTP');
        process.exit(err ? 1 : 0);
      });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
