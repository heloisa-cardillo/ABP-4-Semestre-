import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';

export function buildTestApp() {
  const env = loadEnv();
  return createApp({ env, logger: createLogger(env) });
}
