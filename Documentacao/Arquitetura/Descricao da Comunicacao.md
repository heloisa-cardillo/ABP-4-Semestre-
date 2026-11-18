# Descrição da Comunicação

Este documento explica como os elementos do Sistema Integrado de Controle de Acesso conversam entre si: aplicativo, Terminal de Acesso (ESP32), API, banco de dados e broker MQTT.

A regra principal é que **quem decide se a pessoa entra é sempre o backend**. O celular e o terminal só levam e trazem informação.

![Arquitetura](<arquitetura do projeto.png>)

## Elementos

| Elemento           | Onde roda       | Papel                                                                                                                                         |
| :----------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicativo Flutter | Celular         | Login, consulta de autorizações, leitura do QR Code com GPS, tela de resultado e telas de administração (cadastros, autorizações e histórico) |
| Terminal de Acesso | ESP32           | Mostra o QR Code no display, lê a tag NFC (PN532), usa o GPS e aciona o servo, os LEDs e o buzzer                                             |
| API REST           | Render (Docker) | Node.js, Express e TypeScript. Autentica, aplica as regras de acesso e registra tudo                                                          |
| Banco de dados     | Neon            | PostgreSQL com usuários, locais, terminais, autorizações e histórico                                                                          |
| Broker MQTT        | EMQX Cloud      | Entrega ao terminal a decisão tomada pela API                                                                                                 |

Todas as rotas da API ficam em `/api/v1`. A documentação interativa fica em `/api/v1/docs` (Swagger).

## As 4 conexões

### 1. Aplicativo → API (HTTPS + JWT)

- A pessoa faz login em `POST /auth/login` com e-mail e senha e recebe um token de acesso (JWT, válido por 15 minutos) e um token de renovação (válido por 7 dias).
- Quando o token de acesso vence, o app pede outro em `POST /auth/refresh`, sem pedir a senha de novo.
- Condômino e visitante consultam as próprias autorizações (`GET /me/authorizations`) e enviam o QR Code lido com a posição do GPS (`POST /access/qr`).
- O administrador cadastra usuários e locais (`/users` e `/locations`), cria, consulta, filtra e cancela autorizações (`/authorizations`) e consulta o histórico de todas as tentativas (`GET /access-events`).
- Cada rota confere o perfil da conta (administrador, condômino ou visitante) e bloqueia quem tenta acessar o que não é do seu perfil.

### 2. Terminal → API (HTTPS + credencial do dispositivo)

O terminal não usa login de pessoa. Cada terminal tem a própria credencial, enviada no cabeçalho `Authorization: Terminal <credencial>`.

- **QR Code:** a cada 10 segundos o terminal pede um código novo em `POST /access/qr/challenge` e mostra esse código no display.
- **NFC:** ao ler uma tag, o terminal envia o código dela em `POST /access/nfc`. A própria resposta já traz a decisão (`GRANTED` ou `DENIED`) e a mensagem para o display.

### 3. API → Banco de dados (Prisma, com TLS)

A API grava e consulta os usuários, os locais, os terminais, as autorizações e o histórico de toda tentativa de acesso. O histórico não pode ser alterado nem apagado: o próprio banco recusa essas operações.

### 4. API → Broker → Terminal (MQTT, com TLS)

No acesso por QR Code, quem fala com a API é o celular, não o terminal. Mesmo assim, o terminal precisa saber na hora se abre a catraca, e não pode ficar perguntando à API o tempo todo. Por isso existe o broker MQTT:

- O terminal se conecta ao broker com usuário e senha e assina o tópico `terminals/{id}/decision`. Cada terminal só pode ler o próprio tópico.
- Assim que decide, a API publica nesse tópico a decisão (`GRANTED` ou `DENIED`), a mensagem e o horário do envio.
- O terminal ignora qualquer aviso com mais de 5 segundos, para que um atraso na rede não abra a catraca fora de hora.

## Fluxo do acesso por QR Code

1. O terminal pede um código novo à API e mostra o QR Code no display.
2. A pessoa lê o QR Code com o aplicativo.
3. O app envia o código lido e a posição do GPS em `POST /access/qr`.
4. A API confere o código, a distância de até 100 metros da catraca, a autorização e o horário.
5. A API registra a tentativa no histórico.
6. A API avisa o terminal pelo broker MQTT.
7. A catraca abre ou nega com sinalização de LED e buzzer, e o app mostra o resultado.

## Fluxo do acesso por tag NFC

1. A pessoa aproxima a tag do leitor do terminal.
2. O terminal envia o código da tag à API.
3. A API encontra o dono da tag e confere a autorização e o horário.
4. A API registra a tentativa no histórico.
5. A resposta volta ao terminal, que abre a catraca ou sinaliza a negação com LED e buzzer.

## Falta de conexão

Quando o terminal fica sem rede, ele não tem como confirmar a autorização com a API:

- Por segurança, o acesso é negado.
- O terminal guarda a tentativa na própria memória.
- Quando a conexão volta, o terminal reenvia as tentativas guardadas para a API, que as registra no histórico.

## Regras que a API confere

A primeira regra que falhar define o motivo da negação, que fica gravado no histórico:

| Motivo                    | Quando acontece                                         |
| :------------------------ | :------------------------------------------------------ |
| `INVALID_CREDENTIAL`      | QR Code que não existe                                  |
| `EXPIRED_CREDENTIAL`      | QR Code com mais de 10 segundos                         |
| `CREDENTIAL_ALREADY_USED` | QR Code que já foi usado                                |
| `UNKNOWN_USER`            | Tag NFC sem dono cadastrado                             |
| `USER_INACTIVE`           | Pessoa desativada                                       |
| `TERMINAL_INACTIVE`       | Terminal desativado                                     |
| `NO_AUTHORIZATION`        | Nenhuma autorização para aquele local                   |
| `AUTHORIZATION_CANCELLED` | Autorização cancelada                                   |
| `OUTSIDE_DATE_RANGE`      | Fora das datas da autorização                           |
| `OUTSIDE_TIME_WINDOW`     | Fora do horário da autorização                          |
| `USAGE_LIMIT_REACHED`     | Número de utilizações esgotado                          |
| `OUT_OF_RANGE`            | Celular a mais de 100 metros da catraca (só no QR Code) |

## Segurança

- Toda comunicação é criptografada: HTTPS entre app, terminal e API, e TLS no banco e no MQTT.
- As senhas são guardadas com Argon2id.
- O banco guarda só o hash dos segredos: o QR Code, a credencial de cada terminal e os tokens de renovação.
- O QR Code vale por 10 segundos e só pode ser usado uma vez.
- Cada terminal tem a própria credencial, que o administrador pode trocar se ela vazar.
- O broker exige usuário e senha, e cada terminal só lê o próprio tópico.
- O login aceita no máximo 10 tentativas por minuto, e cada terminal no máximo 60 leituras de NFC por minuto.
- O histórico de acessos é imutável.
