# Backend: API de Controle de Acesso

API REST em **Node.js + Express + TypeScript** (RP01), com **PostgreSQL** via **Prisma**. Toda decisão de liberar ou negar acesso é tomada aqui; o terminal e o aplicativo só exibem e executam.

## Como rodar

### Com Docker (recomendado)

Na raiz do repositório:

```bash
docker compose up --build                            # API, PostgreSQL, migrations e MQTT
docker compose run --rm migrate npx prisma db seed   # cria o administrador inicial
```

A documentação interativa fica em <http://localhost:3000/api/v1/docs>. O administrador do seed local é `admin@acesso.local` / `Admin@12345` (só no compose local; troque por variáveis em qualquer outro ambiente).

### Sem Docker

Requer Node.js 20.19 ou mais novo e um PostgreSQL (o do compose serve: `docker compose up -d postgres`).

```bash
cd Backend
cp .env.example .env          # preencha JWT_SECRET e SEED_ADMIN_PASSWORD
npm ci
npx prisma generate           # gera o client tipado em src/generated (fora do Git)
npx prisma migrate deploy     # aplica as migrations
npx prisma db seed            # cria o administrador
npm run dev
```

## Scripts

| Comando                | O que faz                                                     |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Sobe a API com recarga automática                             |
| `npm run build`        | Compila o TypeScript para `dist/`                             |
| `npm start`            | Roda a versão compilada                                       |
| `npm test`             | Testes unitários e de integração (Vitest + Supertest + banco) |
| `npm run lint`         | ESLint com regras estritas de TypeScript                      |
| `npm run typecheck`    | Checagem de tipos sem gerar arquivos                          |
| `npm run format:check` | Confere a formatação (Prettier)                               |

Os testes de integração usam um banco PostgreSQL real chamado `controle_acesso_test` (criado sozinho se não existir; outro endereço via `TEST_DATABASE_URL`). A suíte só esvazia banco cujo nome termina em `_test`.

O mesmo conjunto roda no GitHub Actions a cada push e em todo pull request (`.github/workflows/backend-ci.yml`), com um PostgreSQL de serviço, seguido do build da imagem Docker.

## Estrutura

```
prisma/
├── schema.prisma  # modelo de dados
├── migrations/    # histórico versionado do banco
└── seed.ts        # dados iniciais (idempotente)
src/
├── config/        # variáveis de ambiente (validadas na subida), logger e banco
├── controllers/   # traduzem HTTP em chamada de serviço; sem regra de negócio
├── docs/          # documento OpenAPI gerado dos schemas Zod
├── middlewares/   # autenticação, perfis, limite de tentativas e tratamento de erros
├── models/        # schemas Zod de entrada e saída (contrato da API)
├── repositories/  # acesso ao banco
├── routes/        # rotas e sua documentação no Swagger
├── services/      # regras de negócio
├── shared/        # tipos e utilitários comuns
├── container.ts   # raiz de composição: instancia e liga as dependências
├── app.ts         # monta a aplicação (sem abrir porta, testável)
└── server.ts      # lê o ambiente, sobe a API e encerra com elegância
tests/             # testes automatizados
```

A dependência aponta para dentro: rota → controller → service → repository. O service não conhece Express; o controller não conhece o banco.

## Convenções da API

- Prefixo `/api/v1`.
- Erro sempre no formato `{ "error": { "code", "message", "details?" } }`. O `code` é estável e é o que o app e o terminal devem tratar; a `message` é texto para gente.
- Toda entrada passa por um schema Zod antes de chegar ao serviço; campo desconhecido no corpo é recusado. O mesmo schema gera o Swagger, então a documentação não diverge do que a API aceita.

## Autenticação (para quem consome a API)

| Rota                 | Quem         | O que faz                                            |
| -------------------- | ------------ | ---------------------------------------------------- |
| `POST /auth/login`   | público      | E-mail e senha → sessão                              |
| `POST /auth/refresh` | público      | Troca o refresh token por uma sessão nova            |
| `POST /auth/logout`  | público      | Encerra a sessão do aparelho                         |
| `GET /auth/me`       | autenticado  | Dados do usuário logado                              |
| `/users` (CRUD)      | só **ADMIN** | Cadastro de administradores, condôminos e visitantes |

Fluxo no app (Flutter):

1. `POST /auth/login` devolve `accessToken` (JWT, 15 min) e `refreshToken` (7 dias). Guarde os dois no armazenamento seguro do aparelho (pacote **`flutter_secure_storage`**: Keychain no iOS, Keystore no Android), nunca em `shared_preferences`.
2. Envie `Authorization: Bearer <accessToken>` em toda chamada.
3. Recebeu `401` com `code: "TOKEN_EXPIRED"`? Chame `POST /auth/refresh` **uma vez** e repita a chamada com o token novo. Cada renovação devolve um refresh token novo; o anterior deixa de valer.
4. **Nunca** faça duas renovações ao mesmo tempo com o mesmo token: o reuso é tratado como roubo de token e encerra a sessão (`REFRESH_TOKEN_REUSED`).
5. Qualquer outro `401` (`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`): mande para a tela de login.

Perfis: `ADMIN` (administrador), `RESIDENT` (condômino), `VISITOR` (visitante). Trocar senha ou perfil, ou desativar o usuário, encerra as sessões abertas dele.

Segurança: senha com Argon2id (parâmetros do OWASP); refresh token guardado só como hash SHA-256; login limitado a 10 tentativas por IP e e-mail a cada 15 minutos; resposta idêntica para e-mail inexistente e senha errada.
