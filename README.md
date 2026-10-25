# FATEC Jacareí - 4º DSM - 2026

<p>Projeto desenvolvido para a ABP (Aprendizagem Baseada em Projetos) do 4º semestre do curso de Desenvolvimento de Software Multiplataforma (DSM), com o tema <b>Sistema Integrado de Controle de Acesso</b>.</p>

> _A ABP conecta os estudantes a desafios reais do mercado de trabalho. Os alunos formam equipes com base na metodologia ágil Scrum, com um Scrum Master, um Product Owner e o restante como Dev Team._

<p align="center">
<a href="#dor-do-cliente">Dor do Cliente</a> |
<a href="#objetivo-do-produto">Objetivo do Produto</a> |
<a href="#backlog-do-produto">Backlog do Produto</a> |
<a href="#sprint">Cronograma de Sprints</a> |
<a href="#dor-e-dod">DoR e DoD</a> |
<a href="#tecnologias">Tecnologias Utilizadas</a> |
<a href="#branch">Estratégia de Branch e Padrão de Commits</a> |
<a href="#estrutura">Estrutura do Projeto</a> |
<a href="#instalacao">Manual de Instalação</a> |
<a href="#usuario">Manual do Usuário</a> |
<a href="#equipe">Equipe</a>
</p>

## Visão Geral

Este projeto desenvolve um sistema integrado de baixo custo para controle de acesso de pessoas a um edifício, usando Internet das Coisas (IoT), dispositivo móvel e backend na nuvem.

No cenário de uso, um cliente previamente autorizado chega a um edifício comercial e precisa passar pela catraca para chegar ao elevador social. A catraca é liberada depois da autenticação, que pode ser feita lendo com o aplicativo o QR Code exibido no Terminal de Acesso ou apresentando uma tag NFC autorizada. A decisão de liberar ou negar o acesso é sempre do backend, e toda tentativa é registrada.

## Dor do Cliente <a id="dor-do-cliente"></a>

Edifícios comerciais, instituições de ensino, condomínios e instalações públicas precisam controlar e registrar quem entra. Os métodos tradicionais, como cartões, crachás e identificação manual, trazem problemas como:

- **Segurança:** cartões e crachás podem ser perdidos, emprestados ou copiados.
- **Rastreabilidade:** a identificação manual dificulta saber com certeza quem entrou, onde e quando.
- **Flexibilidade:** liberar, limitar ou cancelar o acesso de uma pessoa é trabalhoso.
- **Experiência do usuário:** o processo é lento e depende de pessoas ou de objetos físicos.

## Objetivo do Produto <a id="objetivo-do-produto"></a>

Entregar um sistema que integre três componentes:

- **Terminal de Acesso:** dispositivo instalado na entrada, que exibe o QR Code, lê a tag NFC e aciona o mecanismo de abertura.
- **Aplicativo móvel:** usado pelos usuários para consultar autorizações e ler o QR Code do terminal, e também para administrar o sistema e gerenciar autorizações.
- **Backend e banco de dados em nuvem:** validam as credenciais, controlam as autorizações e guardam o histórico de todas as tentativas de acesso.

## Backlog do Produto <a id="backlog-do-produto"></a>

| Rank | Prioridade | User Story | Estimativa | Sprint |
| :--: | :--------: | :--------- | :--------: | :----: |
| 1 | 🔴 Alta | US1: Como usuário do sistema, quero fazer login pelo aplicativo com autenticação via JWT na API, para que apenas pessoas cadastradas tenham acesso ao sistema. | 8 | 1 |
| 2 | 🔴 Alta | US2: Como administrador, quero ter as tabelas de usuários, locais, autorizações e eventos configuradas no banco de dados em nuvem e conectadas à API, para que as informações de controle de acesso sejam gravadas e consultadas de forma confiável. | 8 | 1 |
| 3 | 🔴 Alta | US3: Como administrador, quero que o terminal ESP32 identifique uma tag NFC com o leitor PN532 e acione o servo motor, com os componentes funcionando localmente, para validar o mecanismo de liberação do acesso. | 8 | 1 |
| 4 | 🔴 Alta | US4: Como equipe de desenvolvimento, quero ter o Docker configurado, o repositório organizado e a automação de testes funcionando com pelo menos um teste aprovado, para padronizar o ambiente e garantir a qualidade das entregas. | 5 | 1 |
| 5 | 🔴 Alta | US5: Como equipe de desenvolvimento, quero os diagramas de arquitetura e de casos de uso e os materiais da apresentação organizados, para que todos entendam a solução e para realizar a review da Sprint 1. | 5 | 1 |
| 6 | 🟠 Média | US6: Como administrador, quero cadastrar usuários e locais e criar, filtrar e cancelar autorizações de acesso pelo aplicativo, para controlar quem pode entrar, em qual local e em que período. | 13 | 2 |
| 7 | 🟠 Média | US7: Como condômino ou visitante, quero consultar minhas autorizações e ler o QR Code que muda a cada 10 segundos no terminal, podendo aumentar o tamanho das letras do aplicativo, para ter o acesso validado pelo backend, inclusive pela distância de até 100 metros, e a catraca liberada ou negada, com a tentativa registrada. | 21 | 2 |
| 8 | 🟠 Média | US8: Como visitante, quero apresentar minha tag NFC a um terminal completo, com display, GPS, LEDs e buzzer, e ver a catraca abrir ou negar o acesso com sinalização visual ou sonora e a tentativa registrada, para entrar sem depender do aplicativo. | 21 | 2 |
| 9 | 🟠 Média | US9: Como equipe de desenvolvimento, quero o deploy automático em homologação depois que o CI passar, com o banco de dados em nuvem e retorno claro sobre as falhas e os sucessos do build, dos testes e do deploy, para entregar versões testadas e disponíveis para o time. | 14 | 2 |
| 10 | 🟠 Média | US10: Como administrador, quero consultar o histórico de todas as tentativas de acesso, para ter rastreabilidade do que acontece no edifício. | 14 | 3 |
| 11 | 🟡 Baixa | US11: Como administrador, quero que o terminal consuma pouca energia, continue registrando as tentativas quando ficar sem rede e tenha a comunicação e os dados sensíveis protegidos, para ter um sistema confiável e seguro. | 21 | 3 |
| 12 | 🟡 Baixa | US12: Como usuário do sistema, quero os manuais de instalação e de uso e a documentação técnica concluída, incluindo a descrição da comunicação entre os elementos do sistema, para conseguir instalar e usar o sistema sem dificuldade. | 21 | 3 |

## Cronograma de Sprints <a id="sprint"></a>

| Sprint | Período | Entrega | Documentação |
| --------------- | :-----------: | :--------- | ------------------------------------------------ |
| **SPRINT 1** | 30/09 - 21/10 | Login com JWT na API, banco de dados com as tabelas de usuários, locais, terminais, autorizações e eventos conectado à API, e Docker com CI e testes automatizados. | [Sprint 1 Docs](Material%20Academico/Sprint%20Um) |
| **SPRINT 2** | 22/10 - 11/11 | Administração de usuários, locais e autorizações pelo aplicativo, acesso por QR Code rotativo e tag NFC com validação no backend, catraca abrindo e deploy automático em homologação. | [Sprint 2 Docs](Material%20Academico/Sprint%20Dois) |
| **SPRINT 3** | 12/11 - 25/11 | Histórico de acessos, terminal com baixo consumo e modo offline, comunicação segura e documentação concluída. | [Sprint 3 Docs](Material%20Academico/Sprint%20Tres) |

Datas das reviews: Sprint 1 em 21/10, Sprint 2 em 11/11 e Sprint 3 em 25/11, sempre às 19h30. A apresentação final tem data a definir, no fim do semestre.

## DoR e DoD <a id="dor-e-dod"></a>

### DoR - Definition of Ready

| Critério | Descrição |
| :--- | :--- |
| **Clareza na Descrição** | A User Story deve estar escrita de forma clara e objetiva no padrão: "Como [usuário], quero [ação], para [benefício]" tendo que estar alinhada às regras de negócio. |
| **Critérios de Aceitação Definidos** | A história possui critérios objetivos que indicam o que é necessário para considerá-la concluída. |
| **Dependências Verificadas** | As dependências com outras User Stories ou tarefas estão identificadas e registradas e não há bloqueios para o início da implementação. |
| **Documentos de Apoio** | Critérios de aceitação, cenários e regras de negócio estão documentados e anexados na pasta de documentos . |

### DoD - Definition of Done

| Critério | Descrição |
| :--- | :--- |
| **Critérios de Aceitação Atendidos** | Todos os cenários de testes foram executados e aprovados. |
| **Código Revisado** | O código foi revisado por pelo menos um membro do Dev Team e validado pelo Product Owner. |
| **Estabilidade do Sistema** | A funcionalidade implementada não quebra funcionalidades já existentes no sistema. |
| **Padrão de Commits e Branch Seguido** | O código segue o padrão de mensagens de commit e estratégia de branch definidos pelo time. |
| **Documentação Atualizada** | Documentação da API atualizada ao longo de cada sprint e conferida no final de cada uma (quando aplicável). |
| **Pronto para Deploy** | O código está em uma branch principal, versionado, e pode ser integrado ao produto final sem esforço adicional. |

## Tecnologias Utilizadas <a id="tecnologias"></a>

<div align="center">
<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/MQTT-660066?style=for-the-badge&logo=mqtt&logoColor=white&color=043873">
<img src="https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white&color=043873">
</div>

## Estratégia de Branch e Padrão de Commits <a id="branch"></a>

<details>
<summary>Clique para expandir</summary>

## 🔹 Estrutura de Branches

Adotamos uma variação do GitFlow, com regras específicas para nossa equipe.

**Fluxo Principal**

- `main` → Código estável.
- `desenvolvimento` → Integração da sprint.

**Fluxo de Desenvolvimento**

- `feature/US-<id>-<nome>` → Cada User Story tem sua branch.
- `task/US-<id>-<descrição>` → Subtasks técnicas (opcional).
- `db/sprint-<número>` → Alterações de banco de dados da sprint.

## 🔹 Padrão de Commits

Padrão de Mensagem dos Commits: `(Tipo de commit)(ID da task): Descrição detalhada do que foi feito`

Exemplo: `feat(US-01): adiciona login com JWT`

**Tipos de Commit Aceitos**

| Tipo | Descrição |
| :--- | :--- |
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `chore` | Manutenção, configuração ou build |
| `docs` | Alterações na documentação |
| `style` | Formatação de código (sem alterar lógica) |
| `refactor` | Refatoração de código |
| `test` | Adição ou refatoração de testes |

</details>

## Estrutura do Projeto <a id="estrutura"></a>

<details>
<summary>Clique para expandir</summary>

<pre>
/
├── .github/
│   ├── workflows/
│   │   └── backend-ci.yml
│   └── pull_request_template.md
│
├── Backend/
│   ├── docker/
│   │   └── mosquitto/
│   ├── prisma/
│   │   └── migrations/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── docs/
│   │   ├── middlewares/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── services/
│   │   └── shared/
│   ├── tests/
│   │   └── unit/
│   ├── Dockerfile
│   └── README.md
│
├── Mobile/
│
├── Firmware/
│
├── Documentacao/
│   ├── Arquitetura/
│   │   └── arquitetura.png
│   ├── Casos de Uso/
│   │   ├── Descricao.md
│   │   └── Diagrama de Casos de Uso.png
│   ├── Prototipo/
│   │   └── Prototipo Aplicativo.mp4
│   ├── Descricao da Comunicacao.md
│   └── Manual_do_Usuario.pdf
│
├── Material Academico/
│   ├── Sprint Um/
│   │   ├── MVP.md
│   │   └── Value Proposition Canvas.pdf
│   ├── Sprint Dois/
│   │   ├── MVP.md
│   │   └── Value Proposition Canvas 2.pdf
│   ├── Sprint Tres/
│   │   ├── MVP.md
│   │   └── Value Proposition Canvas 3.pdf
│   └── Manual_de_Instalacao.pdf
│
├── docker-compose.yml
└── README.md
</pre>

</details>

## Manual de Instalação <a id="instalacao"></a>

O Manual de Instalação será adicionado à pasta de material acadêmico do projeto.

## Manual do Usuário <a id="usuario"></a>

O Manual do Usuário será adicionado em PDF à pasta de documentação do projeto.

## Equipe <a id="equipe"></a>

| Cargo | Nome | GitHub |
| :---: | :--: | :----: |
| Scrum Master | Matheus Soldesi | [GitHub](https://github.com/Soldesi) |
| Product Owner | Heloisa Cardillo | [GitHub](https://github.com/heloisa-cardillo) |
| Dev Team | Gabriel Teodoro | [GitHub](https://github.com/teodoroooo) |
| Dev Team | Gabrielly Neu dos Santos | [GitHub](https://github.com/gabriellyneu) |
| Dev Team | Kaique Silva | [GitHub](https://github.com/kaiquehsp) |
| Dev Team | Manuela Castro | [GitHub](https://github.com/manuelalemes) |
| Dev Team | Pedro Claudino Nunes | [GitHub](https://github.com/PEClaudino2006) |
