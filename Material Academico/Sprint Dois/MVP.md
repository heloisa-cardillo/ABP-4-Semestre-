### MVP — Minimum Viable Product

### Sprint 2 — Backend completo e administração pelo aplicativo

Com a segunda Sprint, o backend do fluxo de acesso fica pronto: ele valida o QR Code que muda a cada 10 segundos, conferindo a distância de até 100 metros, a autorização e o horário, valida a tag NFC, registra toda tentativa e avisa a catraca da decisão por MQTT. O histórico das tentativas fica disponível na API. No aplicativo, o administrador cadastra usuários e locais e consulta, filtra e cancela autorizações, e o condômino ou visitante consulta as suas. O deploy em homologação é automático depois que o CI passa.
