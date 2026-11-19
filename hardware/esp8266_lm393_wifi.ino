/*
  NoiseMap — NodeMCU ESP8266 + LM393 4-pin sound sensor
  Wi-Fi direct upload to the existing NoiseMap Google Apps Script endpoint.

  Device:   NM-SIM-01
  Location: 420

  Wiring (NodeMCU development board with onboard A0 divider):
    LM393 VCC -> 3V3
    LM393 GND -> GND
    LM393 AO  -> A0
    LM393 DO  -> D5 (GPIO14)
  
  IMPORTANT:
    - AO is a raw analog microphone-module reading, NOT dB or dB(A).
    - The current LM393 tests showed almost no variation. This firmware
      uploads raw values for diagnosis; it does NOT generate noise alerts.
    - A bare ESP8266 chip ADC is 0-1.0V. Only connect AO directly to A0
      on a NodeMCU dev board whose A0 input divider is confirmed for 3.3V.
    - The device secret and Wi-Fi credentials belong in esp8266_secrets.h,
      which is intentionally excluded from Git.

  Arduino IDE:
    Board: NodeMCU 1.0 (ESP-12E Module) or the matching NodeMCU board.
    Library: ESP8266 board package (ESP8266WiFi, ESP8266HTTPClient).
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include "esp8266_secrets.h"

#ifndef WIFI_SSID
#error "Add WIFI_SSID to hardware/esp8266_secrets.h"
#endif
#ifndef WIFI_PASSWORD
#error "Add WIFI_PASSWORD to hardware/esp8266_secrets.h"
#endif
#ifndef NOISEMAP_DEVICE_SECRET
#error "Add NOISEMAP_DEVICE_SECRET to hardware/esp8266_secrets.h"
#endif

static const char DEVICE_ID[] = "NM-SIM-01";
static const char LOCATION_ID[] = "420";
static const char SOURCE_NAME[] = "esp8266_lm393";
static const char FIRMWARE_VERSION[] = "esp8266-lm393-wifi-v1.0.0";

static const char APPS_SCRIPT_URL[] =
  "https://script.google.com/macros/s/AKfycbz6ART_ZOU3sx9a15_kmBWs8hN8hielk_KhnpeVxIrHRuVJYO4hYpN8xDS8-in63jcIUQ/exec";

static const uint8_t SOUND_ANALOG_PIN = A0;
static const uint8_t SOUND_DIGITAL_PIN = D5;
static const uint8_t SAMPLE_COUNT = 32;
static const uint32_t SAMPLE_GAP_MS = 6;
static const uint32_t OBSERVATION_INTERVAL_MS = 10000;
static const uint32_t HEARTBEAT_INTERVAL_MS = 30000;
static const uint32_t WIFI_RETRY_INTERVAL_MS = 10000;

uint32_t lastObservationAt = 0;
uint32_t lastHeartbeatAt = 0;
uint32_t lastWifiAttemptAt = 0;
bool heartbeatAccepted = false;

struct SoundSample {
  uint16_t average;
  uint16_t minimum;
  uint16_t maximum;
};

SoundSample readSoundSensor() {
  uint32_t total = 0;
  uint16_t minimum = 1023;
  uint16_t maximum = 0;

  for (uint8_t i = 0; i < SAMPLE_COUNT; i++) {
    const uint16_t value = analogRead(SOUND_ANALOG_PIN);
    total += value;
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
    delay(SAMPLE_GAP_MS);
    yield();
  }

  SoundSample result;
  result.average = total / SAMPLE_COUNT;
  result.minimum = minimum;
  result.maximum = maximum;
  return result;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  const uint32_t now = millis();
  if (now - lastWifiAttemptAt < WIFI_RETRY_INTERVAL_MS) return;
  lastWifiAttemptAt = now;

  Serial.println();
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - startedAt < 15000) {
    delay(250);
    yield();
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
    heartbeatAccepted = false;
    lastHeartbeatAt = 0;
  } else {
    Serial.println();
    Serial.println("Wi-Fi connection not ready; will retry.");
  }
}

bool postJson(const String &payload, String &responseBody) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Upload skipped: Wi-Fi is disconnected.");
    return false;
  }

  BearSSL::WiFiClientSecure secureClient;

  // Prototype setting: encrypts traffic but does not verify the server
  // certificate. Replace with a trusted root CA before production use.
  secureClient.setInsecure();

  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setTimeout(15000);

  if (!http.begin(secureClient, APPS_SCRIPT_URL)) {
    Serial.println("HTTP begin failed.");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  const int httpCode = http.POST(payload);
  responseBody = http.getString();
  http.end();

  Serial.print("Apps Script HTTP status: ");
  Serial.println(httpCode);
  Serial.print("Apps Script response: ");
  Serial.println(responseBody);

  return httpCode >= 200 && httpCode < 300 &&
         responseBody.indexOf("\"ok\":true") >= 0;
}

String basePayload(const char *eventName) {
  String payload = "{";
  payload += "\"api_key\":\"" + String(NOISEMAP_DEVICE_SECRET) + "\",";
  payload += "\"event\":\"" + String(eventName) + "\",";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"location_id\":\"" + String(LOCATION_ID) + "\",";
  payload += "\"source\":\"" + String(SOURCE_NAME) + "\",";
  payload += "\"firmware_version\":\"" + String(FIRMWARE_VERSION) + "\"";
  return payload;
}

bool sendHeartbeat() {
  String payload = basePayload("heartbeat");
  payload += "}";

  String response;
  const bool accepted = postJson(payload, response);

  if (accepted) {
    heartbeatAccepted = true;
    lastHeartbeatAt = millis();
    Serial.println("NoiseMap heartbeat accepted.");
  } else {
    heartbeatAccepted = false;
    Serial.println("Heartbeat not accepted. Check device activation, location, secret and Apps Script deployment.");
  }

  return accepted;
}

bool sendObservation() {
  const SoundSample sample = readSoundSensor();
  const int digitalOutput = digitalRead(SOUND_DIGITAL_PIN);

  String payload = basePayload("observation");
  payload += ",\"raw_adc\":" + String(sample.average);
  payload += ",\"sample_min\":" + String(sample.minimum);
  payload += ",\"sample_max\":" + String(sample.maximum);
  payload += ",\"digital_output\":" + String(digitalOutput);
  payload += ",\"status\":\"NORMAL\"";
  payload += ",\"warning_count\":0";
  payload += "}";

  Serial.println("----------------------------------");
  Serial.print("ADC average: "); Serial.println(sample.average);
  Serial.print("ADC min: "); Serial.println(sample.minimum);
  Serial.print("ADC max: "); Serial.println(sample.maximum);
  Serial.print("DO: "); Serial.println(digitalOutput);
  Serial.println("Measurement type: RAW ADC (not dB)");

  String response;
  const bool saved = postJson(payload, response);
  if (saved) {
    Serial.println("Observation saved to NoiseMap.");
  } else {
    Serial.println("Observation upload failed.");
  }
  return saved;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(SOUND_DIGITAL_PIN, INPUT_PULLUP);

  Serial.println();
  Serial.println("====================================");
  Serial.println("NOISEMAP ESP8266 + LM393 STARTING");
  Serial.println("Device: NM-SIM-01");
  Serial.println("Location: 420");
  Serial.println("Source: esp8266_lm393");
  Serial.println("====================================");

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  connectWiFi();
}

void loop() {
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) {
    delay(250);
    return;
  }

  const uint32_t now = millis();

  if (!heartbeatAccepted ||
      now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    delay(100);
  }

  // Do not write observations until Apps Script has accepted the device
  // heartbeat. This prevents unregistered/planned devices from appearing
  // as connected physical sensors.
  if (heartbeatAccepted &&
      (lastObservationAt == 0 ||
       now - lastObservationAt >= OBSERVATION_INTERVAL_MS)) {
    lastObservationAt = millis();
    sendObservation();
  }

  delay(50);
}
