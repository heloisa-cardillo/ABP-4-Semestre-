# Backend: API de Controle de Acesso

[![Backend CI](https://github.com/heloisa-cardillo/ABP-4-Semestre-/actions/workflows/backend-ci.yml/badge.svg?branch=main)](https://github.com/heloisa-cardillo/ABP-4-Semestre-/actions/workflows/backend-ci.yml)

API REST em **Node.js + Express + TypeScript** (RP01), com **PostgreSQL** via **Prisma**. Toda decisão de liberar ou negar acesso é tomada aqui; o terminal e o aplicativo só exibem e executam.

## Como rodar

### Com Docker (recomendado)

Na raiz do repositório:

```bash
docker compose up --build                            # API, PostgreSQL, migrations e MQTT
docker compose run --rm migrate npx prisma db seed   # administrador e dados de demonstração
```

A documentação interativa fica em <http://localhost:3000/api/v1/docs>.

Contas criadas pelo seed no compose local (só local; em qualquer outro ambiente as senhas vêm de variáveis):

| Perfil        | E-mail                   | Senha         |
| ------------- | ------------------------ | ------------- |
| Administrador | `admin@acesso.local`     | `Admin@12345` |
| Condômino     | `condomino@acesso.local` | `Demo@12345`  |
| Visitante     | `visitante@acesso.local` | `Demo@12345`  |

O seed também cria o edifício de demonstração (Edifício › Portaria › Porta › Catraca 1), o terminal da Catraca 1 (a credencial é impressa na primeira execução), uma autorização para cada usuário e dois eventos de exemplo.

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

| Rota                        | Quem         | O que faz                                               |
| --------------------------- | ------------ | ------------------------------------------------------- |
| `POST /auth/login`          | público      | E-mail e senha → sessão                                 |
| `POST /auth/refresh`        | público      | Troca o refresh token por uma sessão nova               |
| `POST /auth/logout`         | público      | Encerra a sessão do aparelho                            |
| `GET /auth/me`              | autenticado  | Dados do usuário logado                                 |
| `/users` (CRUD)             | só **ADMIN** | Cadastro de administradores, condôminos e visitantes    |
| `/locations` (CRUD)         | só **ADMIN** | Edifício › Portaria › Porta › Catraca, com coordenadas  |
| `/terminals` (CRUD)         | só **ADMIN** | Terminais nas catracas e credencial do dispositivo      |
| `GET /terminals/me`         | **terminal** | O dispositivo confere a credencial e onde está          |
| `/authorizations`           | só **ADMIN** | Cria, lista com filtros, busca e cancela autorizações   |
| `GET /me/authorizations`    | autenticado  | Autorizações da própria pessoa logada                   |
| `POST /access/qr/challenge` | **terminal** | Próximo QR Code para exibir (vale 10 s, uso único)      |
| `POST /access/qr`           | autenticado  | O app envia o QR lido e a posição do celular            |
| `POST /access/nfc`          | **terminal** | O terminal envia o UID da tag NFC lida                  |
| `GET /access-events`        | só **ADMIN** | Histórico de todas as tentativas de acesso, com filtros |
| `GET /me/access-events`     | autenticado  | Tentativas de acesso da própria pessoa logada           |

Fluxo no app (Flutter):

1. `POST /auth/login` devolve `accessToken` (JWT, 15 min) e `refreshToken` (7 dias). Guarde os dois no armazenamento seguro do aparelho (pacote **`flutter_secure_storage`**: Keychain no iOS, Keystore no Android), nunca em `shared_preferences`.
2. Envie `Authorization: Bearer <accessToken>` em toda chamada.
3. Recebeu `401` com `code: "TOKEN_EXPIRED"`? Chame `POST /auth/refresh` **uma vez** e repita a chamada com o token novo. Cada renovação devolve um refresh token novo; o anterior deixa de valer.
4. **Nunca** faça duas renovações ao mesmo tempo com o mesmo token: o reuso é tratado como roubo de token e encerra a sessão (`REFRESH_TOKEN_REUSED`).
5. Qualquer outro `401` (`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`): mande para a tela de login.

Perfis: `ADMIN` (administrador), `RESIDENT` (condômino), `VISITOR` (visitante). Trocar senha ou perfil, ou desativar o usuário, encerra as sessões abertas dele.

Segurança: senha com Argon2id (parâmetros do OWASP); refresh token guardado só como hash SHA-256; login limitado a 10 tentativas por IP e e-mail a cada 15 minutos, e renovação + logout a 100 chamadas por IP; resposta idêntica para e-mail inexistente e senha errada.

## Autorizações (para o app)

| Rota                               | Uso no app                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /authorizations`             | Tela "Criar autorização". Mande `userId` (condômino já cadastrado) **ou** `visitor: { name, email, password, phone? }` (visitante novo, criado junto com perfil `VISITOR`). |
| `GET /authorizations`              | Tela de gestão. Filtros: `userId`, `locationId`, `from`/`to` (período: traz as que têm algum dia no intervalo), `situation`, `page`, `pageSize`.                            |
| `GET /authorizations/{id}`         | Detalhe.                                                                                                                                                                    |
| `POST /authorizations/{id}/cancel` | Botão "Cancelar". Corpo opcional `{ "reason": "..." }`. Cancelar de novo: `409 ALREADY_CANCELLED`.                                                                          |
| `GET /me/authorizations`           | Tela "Minhas autorizações" do condômino ou visitante. Filtros `situation`, `from`, `to`.                                                                                    |

Exemplo de criação:

```json
{
  "userId": "019a...",
  "locationId": "019a...",
  "startDate": "2026-11-10",
  "endDate": "2026-11-30",
  "startTime": "08:00",
  "endTime": "18:00",
  "maxUses": 10
}
```

- Datas em `AAAA-MM-DD` e horários em `HH:mm`, **no horário local do edifício** (`BUILDING_TIMEZONE`, padrão `America/Sao_Paulo`).
- Sem `startTime`/`endTime`, vale o dia inteiro (00:00:00 às 23:59:59). Sem `maxUses`, não há limite de usos.
- A autorização vale para o local indicado **e para tudo abaixo dele**: autorizar o edifício libera todas as catracas dele.
- Cada autorização volta com `situation`, calculada na hora: `VALID` (vale hoje), `SCHEDULED` (ainda não começou), `EXPIRED` (terminou), `EXHAUSTED` (usos esgotados) ou `CANCELLED`. Use isso para a etiqueta de situação na tela.
- Erros de regra (`422`): `END_DATE_IN_PAST`, `USER_NOT_FOUND`, `USER_INACTIVE`, `LOCATION_NOT_FOUND`, `LOCATION_INACTIVE`. E-mail de visitante repetido: `409 EMAIL_IN_USE`.

## Histórico de acessos (para o app)

Toda tentativa, liberada ou negada, por QR ou NFC, fica em `access_events`. A lista vem da mais recente para a mais antiga, paginada (`page`, `pageSize` até 100).

| Rota                    | Uso no app                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /access-events`    | Tela "Histórico" do administrador. Filtros: `userId`, `locationId` (inclui tudo abaixo dele), `terminalId`, `method` (`QR`/`NFC`), `result` (`GRANTED`/`DENIED`), `from`/`to`. |
| `GET /me/access-events` | Histórico da própria pessoa. Filtros `method`, `result`, `from`, `to`; mandar `userId` dá `400`.                                                                               |

- `from` e `to` são dias do calendário **no fuso do edifício**, os dois inclusive: `from=2026-11-10&to=2026-11-10` traz o dia 10 inteiro, da meia-noite às 23:59:59 de São Paulo.
- Cada item traz `occurredAt`, `method`, `result`, `denyReason` (nulo quando liberado), `user`, `location` e `terminal` (cada um nulo quando não se aplica, ex.: tag desconhecida não tem `user`), além de `credential` e, no QR, `latitude`, `longitude` e `distanceMeters`.

## Terminal de acesso (para o firmware)

Cada terminal tem uma credencial própria, gerada no cadastro (`POST /terminals`) e mostrada **uma única vez**, no formato `<id>.<segredo>`. O banco guarda só o hash do segredo.

```
GET /api/v1/terminals/me
Authorization: Terminal 019a0000-0000-7000-8000-000000000101.<segredo>
```

Responde onde o terminal está instalado e registra a hora da última conexão. Credencial errada, de terminal desativado ou JWT de usuário: `401 INVALID_TERMINAL_CREDENTIAL`. Terminal extraviado? `POST /terminals/{id}/credential` gera outra e a anterior para de valer na hora.

### Acesso por tag NFC

O terminal lê a tag (PN532) e pergunta à API:

```
POST /api/v1/access/nfc
Authorization: Terminal <credencial>
Content-Type: application/json

{ "uid": "04A1B2C3" }
```

O UID pode vir com ou sem separadores (`04:A1:B2:C3`, `04 a1 b2 c3`); 4, 7 ou 10 bytes. Resposta **200** sempre que o UID é válido:

```json
{
  "result": "GRANTED",
  "denyReason": null,
  "message": "Acesso liberado",
  "eventId": "…",
  "user": { "name": "Ana" }
}
```

- Abra a catraca **somente** se `result == "GRANTED"`. Mostre `message` no display (até 16 caracteres, sem acento).
- Acesso negado **não** é erro HTTP: vem `200` com `result: "DENIED"` e o motivo em `denyReason` (tag desconhecida = `UNKNOWN_USER`).
- `400`: UID mal formado. `401`: credencial do terminal. `429`: mais de 60 leituras por minuto neste terminal.

A tag é vinculada ao usuário pelo administrador, no campo `nfcUid` de `POST /users` ou `PATCH /users/{id}` (`null` desvincula). Uma tag pertence a no máximo uma pessoa (`409 NFC_TAG_IN_USE`).

### Aviso da decisão por MQTT

No QR Code quem chama a API é o celular, então o terminal recebe a decisão pelo broker MQTT. A API publica **toda** decisão de acesso da catraca (QR e NFC, liberada ou negada), com QoS 1:

- Tópico: `terminals/{terminalId}/decision`
- Payload: `{"result":"GRANTED","message":"Acesso liberado","eventId":"…","ts":"2026-11-10T19:30:00.000Z"}`

O firmware deve **ignorar mensagens com mais de 5 s** (`ts`), para um aviso atrasado não abrir a catraca, e pode usar o `eventId` para não agir duas vezes na mesma leitura NFC (que também chega pela resposta HTTP). O aviso fica desligado quando `MQTT_URL` está vazio; se o broker falhar, a API registra no log e responde normalmente, porque o evento já foi gravado.

Para ver as mensagens localmente: `docker compose exec mosquitto mosquitto_sub -t 'terminals/#' -v`.

> **Segurança:** o Mosquitto do compose aceita conexão anônima, o que serve só para a demo. Na US11 (Sprint 3) é preciso usuário e senha (`MQTT_USERNAME`/`MQTT_PASSWORD`), ACL por tópico (cada terminal só lê o próprio) e TLS (`mqtts://`).

### Regras da decisão de acesso

Toda tentativa (QR ou NFC) passa pelo `AccessDecisionService` (`src/services/access-decision.service.ts`), que grava exatamente um evento em `access_events`. A primeira regra que falhar define o motivo:

|  #  | Verificação                                              | Motivo                    |
| :-: | :------------------------------------------------------- | :------------------------ |
|  0  | Negação já detectada (QR expirado, já usado ou inválido) | o próprio motivo          |
|  1  | Terminal e catraca ativos                                | `TERMINAL_INACTIVE`       |
|  2  | Pessoa identificada                                      | `UNKNOWN_USER`            |
|  3  | Pessoa ativa                                             | `USER_INACTIVE`           |
|  4  | Só no QR: celular a até 100 m da catraca                 | `OUT_OF_RANGE`            |
|  5  | Autorização na catraca ou num local acima dela           | `NO_AUTHORIZATION`        |
|  6  | Autorização ativa                                        | `AUTHORIZATION_CANCELLED` |
|  7  | Hoje dentro do período                                   | `OUTSIDE_DATE_RANGE`      |
|  8  | Agora dentro da janela diária                            | `OUTSIDE_TIME_WINDOW`     |
|  9  | Usos abaixo do limite                                    | `USAGE_LIMIT_REACHED`     |

Com várias autorizações, vale a primeira que passar em tudo (primeiro as sem limite de usos, depois a mais próxima da catraca); se nenhuma passar, o motivo é o da que chegou mais longe. Data e horário são comparados no fuso do edifício (`BUILDING_TIMEZONE`). O uso é contado na mesma transação do evento, com incremento condicional: leituras simultâneas não passam do limite.

## Acesso por QR Code

O **terminal exibe** um QR Code que muda a cada 10 segundos e o **app lê**.

```
Terminal (ESP32)                         API                                   App
  │ POST /access/qr/challenge ──────────▶ │ gera código de uso único (10 s)
  │ ◀── 201 { code, expiresAt, ttlSeconds }│
  │ exibe "code" como QR Code              │
  │                                        │ ◀── POST /access/qr ──────────────── │ lê o QR
  │                                        │     { code, latitude, longitude }   │ + GPS do celular
  │                                        │ confere o código e decide           │
  │                                        │ ── 200 { result, denyReason, ... } ▶│ tela de resultado
```

**Firmware:** chame `POST /access/qr/challenge` com `Authorization: Terminal <credencial>` a cada `ttlSeconds` e exiba `code` como QR. Guarde o código só na memória.

**App:** envie o texto lido do QR (`code`) e a posição atual do celular. A resposta é sempre `200` quando o QR é de um terminal:

- `result: "GRANTED"` → acesso liberado.
- `result: "DENIED"` → mostre a mensagem conforme `denyReason`: `EXPIRED_CREDENTIAL` (o QR mudou, leia de novo), `CREDENTIAL_ALREADY_USED`, `INVALID_CREDENTIAL`, `NO_AUTHORIZATION`, `OUT_OF_RANGE` (mais de 100 m da catraca), entre outros.
- `400` → o QR lido não é de um terminal do sistema, ou faltou a posição.

Cada código vale **uma única vez**: duas leituras ao mesmo tempo, só uma passa. Toda leitura é registrada no histórico. A validade é configurável em `QR_CODE_TTL_SECONDS`.

> A decisão (autorização, horário, distância, limite de usos) é do serviço de decisão de acesso: veja "Regras da decisão de acesso" acima. O terminal é avisado do resultado pelo MQTT.

## Deploy em homologação

A cada push na branch `main`, o GitHub Actions (`.github/workflows/backend-ci.yml`) roda:

1. **Lint, tipos, build e testes**, e **build da imagem Docker**. Se algo falhar, para aqui.
2. **Migrations** no banco de homologação (`prisma migrate deploy`) e garante o usuário administrador.
3. **Deploy no Render**, disparado pelo deploy hook.
4. **Confirmação:** espera `GET /api/v1/health` responder com `version` igual ao commit e confere o banco em `/health/ready`.
5. **Resumo** na página da execução, com uma tabela com o resultado de cada etapa. O selo no topo deste README mostra o estado da `main`.

Em pull requests, só a etapa 1 roda.

### Configuração (uma vez só)

**1. Banco no Neon** (gratuito, em <https://neon.tech>)

- Crie um projeto (região `AWS us-east-1`, perto do Render em Virginia) e um banco `controle_acesso`.
- Copie a connection string **direta** (sem `-pooler` no host), terminando em `?sslmode=require`.

**2. API no Render** (gratuito, em <https://render.com>)

- _New → Blueprint_ → selecione este repositório. O `render.yaml` da raiz cria o serviço `controle-acesso-api-homolog` (Docker, plano free, branch `main`, deploy automático desligado). O `JWT_SECRET` é gerado sozinho.
- Na tela do serviço, preencha `DATABASE_URL` com a URL do Neon.
- Em _Settings → Deploy Hook_, copie a URL do hook.

**3. Broker MQTT no HiveMQ Cloud** (gratuito, em <https://console.hivemq.cloud>)

- Crie um cluster **Serverless (Free)** e anote o host (ex.: `abc123.s1.eu.hivemq.cloud`). A porta com TLS é a `8883`.
- Em _Access Management_, crie duas credenciais: `api-homolog` (a API publica as decisões) e `terminal-catraca1` (o ESP32 assina o tópico). Separadas, dá para trocar a senha do terminal sem derrubar a API.
- No Render, preencha `MQTT_URL` (`mqtts://<host>:8883`), `MQTT_USERNAME` e `MQTT_PASSWORD` com a credencial da API. Depois do deploy, o log mostra `conectado ao broker MQTT`.
- Para conferir: no _Web Client_ do HiveMQ, assine `terminals/#` e faça uma tentativa de acesso. A decisão aparece em `terminals/{terminalId}/decision`.
- O plano gratuito não restringe por tópico: qualquer credencial vê todos os tópicos. A ACL por terminal fica para a US11.

**4. GitHub** (quem é admin do repositório): _Settings → Environments → New environment_ `homologacao`

| Tipo     | Nome                          | Valor                                                                                           |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Secret   | `HOMOLOG_DATABASE_URL`        | URL do Neon (a mesma do Render)                                                                 |
| Secret   | `RENDER_DEPLOY_HOOK_URL`      | URL do deploy hook do Render                                                                    |
| Secret   | `HOMOLOG_SEED_ADMIN_PASSWORD` | Senha do administrador de homologação (opcional, mas sem ela o admin não é criado)              |
| Variável | `HOMOLOG_API_URL`             | Endereço do serviço, ex.: `https://controle-acesso-api-homolog.onrender.com` (sem barra no fim) |
| Variável | `HOMOLOG_SEED_ADMIN_EMAIL`    | Opcional. Padrão: `admin@acesso.local`                                                          |

Também é preciso que o GitHub Actions esteja **ativo** no repositório (_Settings → Actions → General → Allow all actions_).

Se faltar alguma configuração, o job de deploy falha logo no primeiro passo, dizendo o que falta.

### Observações

- O plano gratuito do Render **hiberna** depois de 15 minutos sem uso. A primeira chamada depois disso leva cerca de 1 minuto. Antes da Sprint Review, abra `/api/v1/health` para acordar o serviço.
- Os dados de demonstração **não** são criados pelo pipeline, porque o seed imprimiria a credencial do terminal no log público. Para criá-los, rode `npx prisma db seed` localmente com `DATABASE_URL` do Neon e `SEED_DEMO_PASSWORD`.
- O Mosquitto do `docker compose` é só para desenvolvimento local. Na homologação o broker é o HiveMQ Cloud (passo 3). Sem `MQTT_URL` no Render a API funciona normalmente, mas o terminal não recebe o aviso das leituras de QR.

## Modelo de dados

| Tabela           | O que guarda                                                               |
| ---------------- | -------------------------------------------------------------------------- |
| `users`          | Pessoas e perfis (RF01)                                                    |
| `refresh_tokens` | Sessões abertas, só o hash                                                 |
| `locations`      | Hierarquia Edifício › Portaria › Porta › Catraca, com coordenadas (RF02)   |
| `terminals`      | Terminal de cada catraca e o hash da credencial do dispositivo (RF11)      |
| `authorizations` | Pessoa, local, datas, horários, limite e contagem de usos, situação (RF03) |
| `access_events`  | Toda tentativa de acesso, liberada ou negada, com o motivo (RF06, RF17)    |

O banco protege as regras por conta própria, mesmo para quem escreve fora da API: coordenadas dentro da faixa e sempre em par, só o edifício sem local de cima, término da autorização depois do início, usos dentro do limite, cancelamento coerente com a situação, motivo obrigatório só em tentativa negada. O histórico de acessos é **imutável**: o banco recusa `UPDATE` e `DELETE` em `access_events`.

A autorização vale para o local indicado e para tudo que está abaixo dele (autorização no edifício libera todas as catracas do edifício). Os endpoints de autorização e de validação de acesso entram na Sprint 2.
