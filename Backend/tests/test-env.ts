/** Banco exclusivo dos testes. É apagado e recriado a cada execução da suíte. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://acesso:acesso_dev@127.0.0.1:5432/controle_acesso_test';

/** Trava de segurança: a suíte só apaga banco cujo nome termina em `_test`. */
export function assertIsTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Recusando rodar testes no banco "${name}": o nome precisa terminar em _test.`);
  }
}
