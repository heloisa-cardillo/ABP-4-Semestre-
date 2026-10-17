### MVP — Minimum Viable Product

### Sprint 1 — Estrutura base: autenticação, banco de dados e terminal de acesso

Com a primeira Sprint, o sistema já tem a estrutura base para o controle de acesso: o usuário faz login pelo aplicativo com autenticação via JWT na API, que se comunica com o banco de dados em nuvem onde ficam as tabelas de usuários, locais, autorizações e eventos. O terminal ESP32 já identifica uma tag RFID e aciona o servo motor, ainda funcionando de forma local. O ambiente está padronizado com Docker e conta com automação de testes, com pelo menos um teste aprovado.