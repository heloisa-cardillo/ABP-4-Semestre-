import { TEST_DATABASE_URL } from './test-env.js';

// Ambiente mínimo e determinístico para os testes.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
