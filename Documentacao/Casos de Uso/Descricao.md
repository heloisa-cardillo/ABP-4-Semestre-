# Casos de Uso

Este documento explica o diagrama de casos de uso do sistema. O diagrama mostra quem usa o sistema e o que cada um consegue fazer, e a tabela abaixo descreve cada caso de uso.

Os atores são o Administrador, o Condômino, o Visitante e o Terminal de Acesso. Cada caso de uso está ligado ao requisito do desafio (RF) de onde ele vem.

![Diagrama de Casos de Uso](Diagrama%20de%20Casos%20de%20Uso.png)

## Descrição dos Casos de Uso

| ID | Caso de Uso | Ator | Descrição | Requisito |
| :--: | :---------- | :--- | :-------- | :-------: |
| UC01 | Cadastrar usuários | Administrador | Cadastra usuários nos perfis de administrador, condômino e visitante. | RF01 |
| UC02 | Cadastrar locais de acesso | Administrador | Cadastra os locais controlados, com identificação e localização do edifício, portaria, porta e catraca. | RF02 |
| UC03 | Criar autorização | Administrador | Cria uma autorização de acesso informando pessoa, local, período, horário, quantidade de utilizações e situação. | RF03 |
| UC04 | Consultar autorizações | Administrador | Consulta as autorizações existentes usando filtros. | RF04 |
| UC05 | Cancelar autorização | Administrador | Cancela uma autorização criada anteriormente. | RF05 |
| UC06 | Consultar histórico de acessos | Administrador | Consulta o histórico das tentativas de acesso. | RF06 |
| UC07 | Autenticar no aplicativo | Administrador, Condômino, Visitante | Faz login no aplicativo móvel. | RF07 |
| UC08 | Consultar minhas autorizações | Condômino, Visitante | Visualiza no aplicativo as próprias autorizações de acesso. | RF08 |
| UC09 | Ler QR Code do terminal | Condômino, Visitante | Lê com o aplicativo o QR Code exibido no Terminal de Acesso. | RF09 |
| UC10 | Apresentar tag NFC ao terminal | Visitante | Apresenta uma tag NFC autorizada para o terminal ler. | RF10 |
| UC11 | Exibir QR Code | Terminal de Acesso | Exibe o QR Code gerado pelo backend, substituído a cada 10 segundos. | RF12 |
| UC12 | Validar acesso | Terminal de Acesso | Envia a credencial (QR Code ou tag NFC) ao backend, que verifica se o acesso é válido. | RF13, RF14 |
| UC13 | Liberar acesso | Terminal de Acesso | Aciona o mecanismo de abertura quando a credencial é válida. | RF15 |
| UC14 | Negar acesso | Terminal de Acesso | Não libera a entrada e indica a decisão de forma visual ou sonora quando a credencial é inválida, expirada, cancelada ou não autorizada. | RF16 |
| UC15 | Registrar evento | Terminal de Acesso | Registra no sistema toda tentativa de acesso. | RF17 |
