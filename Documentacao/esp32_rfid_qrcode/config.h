// ============================================================
//  config.h  -  CONFIGURACOES E SEGREDOS DO TERMINAL
//  NAO COMMITAR ESTE ARQUIVO NO GITHUB (adicione ao .gitignore)
// ============================================================
#pragma once

// ---------- Wi-Fi (PREENCHA) ----------
#define WIFI_SSID   "Soldesi2"
#define WIFI_SENHA  "spock1234"

// ---------- API (HTTPS) ----------
#define API_BASE "https://controle-acesso-api-homolog.onrender.com/api/v1"

// Credencial do terminal (formato: <terminalId>.<segredo>)
// Se vazar, o admin gera outra em POST /terminals/{id}/credential
#define TERMINAL_CREDENCIAL "019a0000-0000-7000-8000-000000000101.zFc4TBEa7VAMnrMQIwh-TISEREq2M9NdBM6M5P4x-Q4"

// ---------- MQTT (EMQX Cloud, TLS) ----------
#define MQTT_HOST     "tdd4d18d.ala.eu-central-1.emqxsl.com"
#define MQTT_PORTA    8883
#define MQTT_USUARIO  "terminal-catraca1"
#define MQTT_SENHA    "@Ghsz1973"   // pedir ao colega do backend (mensagem privada)

// ---------- Certificados (TLS) ----------
// Vazio ("") = modo INSEGURO (setInsecure), aceitavel so na demo.
// Para producao: cole o certificado raiz entre R"EOF( e )EOF"
//   MQTT: botao "CA Certificate" no Deployment Overview do EMQX
#define MQTT_CA_CERT ""
#define API_CA_CERT  ""

// ---------- NFC: formato do pedido a API (CONFIRMAR COM O BACKEND) ----------
// Nome do campo JSON que leva o UID da tag em POST /access/nfc
#define NFC_CAMPO_UID "uid"
// 1 = "AA:BB:CC:DD"   0 = "AABBCCDD"
#define NFC_UID_COM_DOIS_PONTOS 1
