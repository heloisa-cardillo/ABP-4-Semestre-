/*
  TERMINAL DE ACESSO - ESP32  (integrado ao backend)

  QR code : o terminal pede um codigo novo a API por HTTPS a cada ~10 s
  NFC     : o terminal envia o UID por HTTPS e a decisao vem na resposta
  Decisao do QR lido no celular: a API avisa por MQTT (terminals/{id}/decision)

  Bibliotecas (Gerenciador de Bibliotecas da Arduino IDE):
    - MFRC522               (GithubCommunity)
    - Adafruit SSD1306 + Adafruit GFX Library
    - ESP32Servo            (Kevin Harrington)
    - PubSubClient          (Nick O'Leary)
    - ArduinoJson           (Benoit Blanchon, versao 7)
  Na MESMA pasta do .ino: config.h, qrcodegen.c, qrcodegen.h

  Pinagem:
    OLED SDA/SCL 21/22 | RFID SS 26, RST 27, SCK/MISO/MOSI 18/19/23
    LED verde 32 | LED vermelho 33 | Buzzer 25 | Servo 13
*/

#include <SPI.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include "qrcodegen.h"
#include "config.h"

// ================= PINOS =================
#define RFID_SS      26
#define RFID_RST     27
#define SPI_SCK      18
#define SPI_MISO     19
#define SPI_MOSI     23
#define OLED_SDA     21
#define OLED_SCL     22
#define LED_VERDE    32
#define LED_VERMELHO 33
#define BUZZER       25
#define SERVO_PIN    13

// ================= AJUSTES =================
#define SERVO_FECHADO   0
#define SERVO_ABERTO    90
#define TEMPO_ABERTO    2000     // ms com a catraca aberta
#define OLED_ENDERECO   0x3C     // se nao funcionar, tente 0x3D
#define OLED_CONTRASTE  90       // 0 a 255
#define HTTP_TIMEOUT_MS 8000     // a API no Render pode demorar a "acordar"
#define DECISAO_MAX_IDADE_S 5    // ignora decisoes MQTT mais velhas que isso
#define QR_ESCALA       2

#define UID_LIBERADO_LOCAL "E6:83:32:06"

// ================= OBJETOS =================
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MFRC522 rfid(RFID_SS, RFID_RST);
Servo servo;
WiFiClientSecure mqttNet;
PubSubClient mqtt(mqttNet);

String terminalId;       // derivado da credencial
String topicoDecisao;    // terminals/{terminalId}/decision
bool rfidOk = false;

// ---- QR ----
#define QR_VERSAO_MIN 1
#define QR_VERSAO_MAX 6
uint8_t qrcode[qrcodegen_BUFFER_LEN_FOR_VERSION(QR_VERSAO_MAX)];
uint8_t qrTemp[qrcodegen_BUFFER_LEN_FOR_VERSION(QR_VERSAO_MAX)];
bool qrOk = false;
unsigned long qrExpiraEm = 0;
unsigned long proximoQR = 0;

// ---- decisao vinda do MQTT (tratada no loop, nao no callback) ----
struct DecisaoPendente {
  bool ativa = false;
  bool liberado = false;
  String mensagem;
};
DecisaoPendente pendente;

// ---- eventIds ja tratados (evita agir 2x na mesma leitura) ----
#define MAX_IDS 8
String idsProcessados[MAX_IDS];
int idxIds = 0;

unsigned long ultimaTentativaMqtt = 0;

// ================= UTILITARIOS =================
void beep(int duracao) {
  digitalWrite(BUZZER, HIGH);
  delay(duracao);
  digitalWrite(BUZZER, LOW);
}

// O display so mostra ASCII: troca acentos por letras simples
String semAcentos(const String& s) {
  static const char* mapa1 = "AAAAAAACEEEEIIIIDNOOOOOxOUUUUYTs"; // U+00C0..U+00DF
  static const char* mapa2 = "aaaaaaaceeeeiiiidnooooo/ouuuuyty"; // U+00E0..U+00FF
  String o;
  o.reserve(s.length());
  for (size_t i = 0; i < s.length(); i++) {
    unsigned char c = s[i];
    if (c < 0x80) {
      o += (char)c;
    } else if (c == 0xC3 && i + 1 < s.length()) {
      unsigned char d = s[++i];
      if (d >= 0x80 && d <= 0x9F) o += mapa1[d - 0x80];
      else if (d >= 0xA0 && d <= 0xBF) o += mapa2[d - 0xA0];
      else o += '?';
    } else if (c >= 0xC0) {
      o += '?';
      while (i + 1 < s.length() && ((unsigned char)s[i + 1] & 0xC0) == 0x80) i++;
    }
  }
  return o;
}

// "2026-11-11T14:00:10.000Z" -> segundos desde 1970 (UTC). -1 se invalido.
long long parseISO8601(const char* ts) {
  int y, mo, d, h, mi, s;
  if (!ts || sscanf(ts, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &s) != 6) return -1;
  int yy = y - (mo <= 2 ? 1 : 0);
  long era = (yy >= 0 ? yy : yy - 399) / 400;
  long yoe = yy - era * 400;
  long doy = (153L * (mo + (mo > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  long long dias = (long long)era * 146097 + doe - 719468;
  return dias * 86400LL + h * 3600LL + mi * 60LL + s;
}

bool horaSincronizada() {
  return time(nullptr) > 1700000000;
}

// So aceita decisao recente (evita aviso atrasado abrir a catraca)
bool decisaoRecente(const char* ts) {
  if (!horaSincronizada()) {
    Serial.println("MQTT: hora ainda nao sincronizada (NTP), decisao ignorada por seguranca");
    return false;
  }
  long long t = parseISO8601(ts);
  if (t < 0) return false;
  long long idade = (long long)time(nullptr) - t;
  return idade <= DECISAO_MAX_IDADE_S && idade >= -10;
}

bool jaProcessado(const char* id) {
  for (int i = 0; i < MAX_IDS; i++)
    if (idsProcessados[i].length() > 0 && idsProcessados[i] == id) return true;
  return false;
}

void marcarProcessado(const char* id) {
  if (!id || !id[0]) return;
  idsProcessados[idxIds] = id;
  idxIds = (idxIds + 1) % MAX_IDS;
}

// ================= TELAS (OLED) =================
void desenharTelaQR() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  int tamanho = qrOk ? qrcodegen_getSize(qrcode) : 0;

  if (tamanho > 0) {
    int escala = (tamanho * QR_ESCALA + 4 <= 64) ? QR_ESCALA : 1;
    int pixels = tamanho * escala;

    if (pixels + 6 <= 48) {
      // QR pequeno: inteiro na parte AZUL (y = 16..63)
      display.fillRect(0, 16, 48, 48, SSD1306_WHITE);
      int ox = (48 - pixels) / 2;
      int oy = 16 + (48 - pixels) / 2;
      for (int y = 0; y < tamanho; y++)
        for (int x = 0; x < tamanho; x++)
          if (qrcodegen_getModule(qrcode, x, y))
            display.fillRect(ox + x * escala, oy + y * escala, escala, escala, SSD1306_BLACK);
      display.setCursor(0, 4);
      display.println("Aproxime o cartao");
      display.setCursor(56, 30);
      display.println("ou leia o");
      display.setCursor(56, 42);
      display.println("QR code");
    } else {
      // QR maior: ocupa a altura toda
      display.fillRect(0, 0, 64, 64, SSD1306_WHITE);
      int off = (64 - pixels) / 2;
      for (int y = 0; y < tamanho; y++)
        for (int x = 0; x < tamanho; x++)
          if (qrcodegen_getModule(qrcode, x, y))
            display.fillRect(off + x * escala, off + y * escala, escala, escala, SSD1306_BLACK);
      display.setCursor(70, 14);
      display.println("Aproxime");
      display.setCursor(70, 26);
      display.println("o cartao");
      display.setCursor(70, 44);
      display.println("ou leia o");
      display.setCursor(70, 54);
      display.println("QR code");
    }
  } else {
    display.setCursor(0, 4);
    display.println("Aproxime o cartao");
    display.setCursor(0, 30);
    display.println("QR code indisponivel");
    display.setCursor(0, 42);
    display.println(WiFi.status() == WL_CONNECTED ? "Buscando na API..." : "Sem Wi-Fi...");
  }
  display.display();
}

void mostrarStatus(const char* linha1, const String& linha2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 4);
  display.println(linha1);
  display.setCursor(0, 30);
  display.println(linha2);
  display.display();
}

void mostrarResultado(const char* titulo, const String& msg, const String& rodape) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println(titulo);
  display.setTextSize(1);
  display.setCursor(0, 24);
  display.println(msg.substring(0, 42));
  if (rodape.length()) {
    display.setCursor(0, 54);
    display.println(rodape);
  }
  display.display();
}

// ================= QR CODE =================
void atualizarQR(const char* texto) {
  qrOk = qrcodegen_encodeText(texto, qrTemp, qrcode, qrcodegen_Ecc_LOW,
                              QR_VERSAO_MIN, QR_VERSAO_MAX, qrcodegen_Mask_AUTO, true);
  if (!qrOk) {
    Serial.println("QR: texto grande demais para gerar o QR code");
  } else if (qrcodegen_getSize(qrcode) > 29) {
    Serial.print("AVISO: codigo com ");
    Serial.print(strlen(texto));
    Serial.println(" caracteres. Acima de 53 vira QR de 1 px por modulo no OLED (dificil de ler). Pedir codigo mais curto ao backend.");
  }
  desenharTelaQR();
}

// ================= HTTPS =================
// Retorna o codigo HTTP (ou valor negativo em erro). Resposta em 'resposta'.
int httpPost(const String& caminho, const String& corpo, String& resposta) {
  if (WiFi.status() != WL_CONNECTED) return -100;

  WiFiClientSecure client;
  if (API_CA_CERT[0]) client.setCACert(API_CA_CERT);
  else client.setInsecure();

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, String(API_BASE) + caminho)) return -101;

  http.addHeader("Authorization", String("Terminal ") + TERMINAL_CREDENCIAL);
  http.addHeader("Accept", "application/json");
  if (corpo.length() > 0) http.addHeader("Content-Type", "application/json");

  int codigo = http.POST(corpo);
  if (codigo > 0) resposta = http.getString();
  http.end();
  return codigo;
}

// Pede um QR novo: POST /access/qr/challenge  ->  { code, expiresAt, ttlSeconds }
void buscarQR() {
  String resp;
  int codigo = httpPost("/access/qr/challenge", "", resp);

  if (codigo == 200 || codigo == 201) {
    JsonDocument doc;
    if (!deserializeJson(doc, resp)) {
      JsonVariant raiz = doc["data"].is<JsonObject>() ? doc["data"].as<JsonVariant>()
                                                      : doc.as<JsonVariant>();
      const char* code = raiz["code"] | "";
      int ttl = raiz["ttlSeconds"] | 10;
      if (code[0]) {
        atualizarQR(code);
        qrExpiraEm = millis() + (unsigned long)ttl * 1000UL;
        // pede o proximo 2 s antes de expirar (sem intervalo sem QR valido)
        int espera = (ttl > 3) ? ttl - 2 : 1;
        proximoQR = millis() + (unsigned long)espera * 1000UL;
        return;
      }
    }
    Serial.println("QR: resposta da API sem o campo 'code'");
  } else {
    Serial.print("QR: falha (HTTP ");
    Serial.print(codigo);
    Serial.println(")");
    if (codigo == 401 || codigo == 403) Serial.println("Credencial do terminal recusada pela API.");
  }
  proximoQR = millis() + 3000UL;   // tenta de novo em 3 s
}

// ================= MQTT =================
// Mensagem: {"result":"GRANTED","message":"...","eventId":"...","ts":"..."}
void onMqtt(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) {
    Serial.println("MQTT: JSON invalido");
    return;
  }
  const char* result  = doc["result"] | "";
  const char* message = doc["message"] | "";
  const char* eventId = doc["eventId"] | "";
  const char* ts      = doc["ts"] | "";

  if (!decisaoRecente(ts)) {
    Serial.println("MQTT: mensagem antiga ou sem hora valida, ignorada");
    return;
  }
  if (eventId[0] && jaProcessado(eventId)) {
    Serial.println("MQTT: evento ja tratado, ignorado");
    return;
  }
  marcarProcessado(eventId);

  pendente.liberado = (strcmp(result, "GRANTED") == 0);
  pendente.mensagem = message;
  pendente.ativa = true;
  Serial.print("MQTT: decisao recebida = ");
  Serial.println(result);
}

void conectarMQTT() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - ultimaTentativaMqtt < 5000UL) return;
  ultimaTentativaMqtt = millis();

  Serial.print("MQTT: conectando... ");
  String clientId = "terminal-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqtt.connect(clientId.c_str(), MQTT_USUARIO, MQTT_SENHA)) {
    mqtt.subscribe(topicoDecisao.c_str());
    Serial.println("ok, inscrito em " + topicoDecisao);
  } else {
    Serial.print("falhou (rc=");
    Serial.print(mqtt.state());
    Serial.println(")");
  }
}

// ================= ACOES (LED / BUZZER / SERVO) =================
void executarDecisao(bool liberado, const String& msg, const String& rodape) {
  String m = semAcentos(msg);
  if (m.length() == 0) m = liberado ? "Acesso liberado" : "Acesso negado";
  mostrarResultado(liberado ? "LIBERADO" : "NEGADO", m, rodape);

  if (liberado) {
    digitalWrite(LED_VERDE, HIGH);
    beep(150);
    servo.write(SERVO_ABERTO);
    delay(TEMPO_ABERTO);
    servo.write(SERVO_FECHADO);
    digitalWrite(LED_VERDE, LOW);
  } else {
    digitalWrite(LED_VERMELHO, HIGH);
    for (int i = 0; i < 3; i++) {
      beep(100);
      delay(100);
    }
    delay(800);
    digitalWrite(LED_VERMELHO, LOW);
  }
  desenharTelaQR();
}

// ================= NFC =================
String lerUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
    if (NFC_UID_COM_DOIS_PONTOS && i < rfid.uid.size - 1) uid += ":";
  }
  uid.toUpperCase();
  return uid;
}

// POST /access/nfc com o UID. A decisao vem na resposta.
void tratarTagNFC(const String& uid) {
  mostrarStatus("Verificando tag...", uid);

  JsonDocument corpoDoc;
  corpoDoc[NFC_CAMPO_UID] = uid;
  String corpo;
  serializeJson(corpoDoc, corpo);

  String resp;
  int codigo = httpPost("/access/nfc", corpo, resp);
  Serial.print("NFC: HTTP ");
  Serial.println(codigo);
  Serial.println("NFC: resposta da API: " + resp);

  bool liberado = false;
  String msg;
  String eventId;
  bool entendeu = false;

  if (codigo > 0) {
    JsonDocument doc;
    if (!deserializeJson(doc, resp)) {
      JsonVariant raiz = doc["data"].is<JsonObject>() ? doc["data"].as<JsonVariant>()
                                                      : doc.as<JsonVariant>();
      const char* result = raiz["result"] | "";
      if (result[0]) {
        liberado = (strcmp(result, "GRANTED") == 0);
        msg = (const char*)(raiz["message"] | "");
        eventId = (const char*)(raiz["eventId"] | "");
        entendeu = true;
      }
    }
  }

  if (!entendeu) {
    liberado = false;
    if (codigo == 401 || codigo == 403) msg = "Terminal nao autorizado";
    else if (codigo > 0) msg = "Erro da API (" + String(codigo) + ")";
    else msg = "Sem conexao com a API";
    Serial.println("NFC: resposta nao entendida: " + resp);
  }

  // Excecao local: esta tag sempre libera, mesmo se a API negar
  if (UID_LIBERADO_LOCAL[0] && uid == UID_LIBERADO_LOCAL) {
    liberado = true;
    msg = "Acesso liberado";
    Serial.println("NFC: tag liberada localmente (ignora a API)");
  }

  if (eventId.length() > 0) marcarProcessado(eventId.c_str());  // a copia via MQTT sera ignorada
  Serial.println(liberado ? "NFC: LIBERADO" : "NFC: NEGADO");
  executarDecisao(liberado, msg, uid);
}

void lerTag() {
  if (!rfidOk) return;
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = lerUID();
  Serial.println("UID do cartao: " + uid);
  tratarTagNFC(uid);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(500);
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("TERMINAL DE ACESSO INICIANDO...");

  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_VERMELHO, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_VERMELHO, LOW);
  digitalWrite(BUZZER, LOW);

  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, 500, 2400);
  servo.write(SERVO_FECHADO);

  // OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ENDERECO)) {
    Serial.println("Falha ao iniciar o OLED! Verifique SDA/SCL e endereco.");
  }
  display.ssd1306_command(SSD1306_SETCONTRAST);
  display.ssd1306_command(OLED_CONTRASTE);
  mostrarStatus("Iniciando...", "");

  // RFID
  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, RFID_SS);
  rfid.PCD_Init();
  delay(100);
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  byte versao = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.print("MFRC522 versao: 0x");
  Serial.println(versao, HEX);
  // 0x00 e 0xFF = sem resposta (fio solto). Qualquer outro valor (0x91, 0x92, 0x82 de clones...) e aceito.
  rfidOk = (versao != 0x00 && versao != 0xFF);
  if (versao == 0x91 || versao == 0x92) {
    Serial.println("RFID: MFRC522 original.");
  } else if (rfidOk) {
    Serial.println("RFID: versao diferente do original (clone), seguindo normalmente.");
  } else {
    Serial.println("ERRO: leitor RFID NAO responde (fiacao?). NFC desativado (o QR continua).");
  }

  // Teste rapido dos atuadores
  digitalWrite(LED_VERDE, HIGH);
  digitalWrite(LED_VERMELHO, HIGH);
  beep(100);
  delay(200);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_VERMELHO, LOW);

  // Identificacao do terminal (parte da credencial antes do ".")
  String cred = TERMINAL_CREDENCIAL;
  int ponto = cred.indexOf('.');
  terminalId = (ponto > 0) ? cred.substring(0, ponto) : cred;
  topicoDecisao = "terminals/" + terminalId + "/decision";
  Serial.println("Terminal: " + terminalId);

  // Wi-Fi
  mostrarStatus("Conectando Wi-Fi...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000UL) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi ok, IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("Wi-Fi NAO conectou (vai tentar de novo em segundo plano)");
  }

  // Hora (necessaria para validar o 'ts' das decisoes MQTT)
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  inicio = millis();
  while (!horaSincronizada() && millis() - inicio < 10000UL) delay(200);
  Serial.println(horaSincronizada() ? "Hora sincronizada (NTP)" : "Hora ainda nao sincronizada");

  // MQTT (TLS)
  if (MQTT_CA_CERT[0]) mqttNet.setCACert(MQTT_CA_CERT);
  else mqttNet.setInsecure();
  mqttNet.setTimeout(8);
  mqtt.setServer(MQTT_HOST, MQTT_PORTA);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onMqtt);

  proximoQR = millis();      // busca o primeiro QR ja no loop
  desenharTelaQR();
  Serial.println("Pronto. Aproxime o cartao ou leia o QR code.");
}

// ================= LOOP =================
void loop() {
  conectarMQTT();
  mqtt.loop();

  // Decisao recebida por MQTT (QR lido no celular)
  if (pendente.ativa) {
    bool lib = pendente.liberado;
    String msg = pendente.mensagem;
    pendente.ativa = false;
    executarDecisao(lib, msg, "");
  }

  // QR expirado e sem renovacao: nao deixa um QR velho na tela
  if (qrOk && (int32_t)(millis() - qrExpiraEm) > 0) {
    qrOk = false;
    desenharTelaQR();
  }

  // Pede o proximo QR
  if (WiFi.status() == WL_CONNECTED && (int32_t)(millis() - proximoQR) >= 0) {
    buscarQR();
  }

  lerTag();
}
