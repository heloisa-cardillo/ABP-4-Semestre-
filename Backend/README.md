# Backend: API de Controle de Acesso

API REST em **Node.js + Express + TypeScript** (RP01). Toda decisão de liberar ou negar acesso é tomada aqui; o terminal e o aplicativo só exibem e executam.

## Como rodar

### Com Docker (recomendado)

Na raiz do repositório:

```bash
docker compose up --build
```

Sobe a API, o PostgreSQL e o broker MQTT. A documentação interativa fica em <http://localhost:3000/api/v1/docs>.

### Sem Docker

Requer Node.js 20.19 ou mais novo.

```bash
cd Backend
cp .env.example .env
npm ci
npm run dev
```

## Scripts

| Comando                | O que faz                                         |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Sobe a API com recarga automática                 |
| `npm run build`        | Compila o TypeScript para `dist/`                 |
| `npm start`            | Roda a versão compilada                           |
| `npm test`             | Roda os testes automatizados (Vitest + Supertest) |
| `npm run lint`         | ESLint com regras estritas de TypeScript          |
| `npm run typecheck`    | Checagem de tipos sem gerar arquivos              |
| `npm run format:check` | Confere a formatação (Prettier)                   |

O mesmo conjunto roda no GitHub Actions a cada push e em todo pull request (`.github/workflows/backend-ci.yml`), seguido do build da imagem Docker.

## Estrutura

```
src/
├── config/        # variáveis de ambiente (validadas na subida) e logger
├── controllers/   # traduzem HTTP em chamada de serviço; sem regra de negócio
├── docs/          # documento OpenAPI gerado dos schemas Zod
├── middlewares/   # validação de entrada e tratamento de erros
├── models/        # schemas Zod de entrada e saída (contrato da API)
├── repositories/  # acesso ao banco
├── routes/        # rotas e sua documentação no Swagger
├── services/      # regras de negócio
├── shared/        # tipos e utilitários comuns
├── app.ts         # monta a aplicação (sem abrir porta, testável)
└── server.ts      # raiz de composição: lê o ambiente, liga as dependências e sobe
tests/             # testes automatizados
```

A dependência aponta para dentro: rota → controller → service → repository. O service não conhece Express; o controller não conhece o banco.

## Convenções da API

- Prefixo `/api/v1`.
- Erro sempre no formato `{ "error": { "code", "message", "details?" } }`. O `code` é estável e é o que o app e o terminal devem tratar; a `message` é texto para gente.
- Toda entrada passa por um schema Zod antes de chegar ao controller. O mesmo schema gera o Swagger, então a documentação não diverge do que a API aceita.
