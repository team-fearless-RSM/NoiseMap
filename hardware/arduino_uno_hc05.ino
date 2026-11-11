/*
  NoiseMap — Arduino Uno + LM393 (4-pin) + HC-05
  Sends newline-delimited JSON to the paired computer bridge.
  Raw ADC values are not calibrated dB/dB(A).

  Wiring:
    LM393 AO  -> A0
    LM393 DO  -> D2 (optional digital comparator diagnostic)
    LM393 VCC -> 5V
    LM393 GND -> GND
    HC-05 TXD -> D10 (SoftwareSerial RX)
    HC-05 RXD <- D11 (SoftwareSerial TX) THROUGH a 5V-to-3.3V divider
    HC-05 VCC/GND -> module breakout's specified supply/GND
    Buzzer + -> D8, buzzer - -> GND

  Keep USB Serial Monitor at 9600 for diagnostics.
  HC-05 SPP data baud is commonly 9600; set NOISEMAP_BAUD to match.
*/
#include <SoftwareSerial.h>

const byte SOUND_ANALOG_PIN = A0;
const byte SOUND_DIGITAL_PIN = 2;
const byte BUZZER_PIN = 8;
const byte HC05_RX_PIN = 10; // Arduino receives from HC-05 TX
const byte HC05_TX_PIN = 11; // Arduino sends to HC-05 RX through divider

const char DEVICE_ID[] = "REPLACE_WITH_REGISTERED_DEVICE_ID";
const char LOCATION_ID[] = "REPLACE_WITH_FIRESTORE_LOCATION_DOCUMENT_ID";
const char FIRMWARE_VERSION[] = "uno-hc05-v1";

const int NOISE_THRESHOLD_ADC = 700; // Tune using observed raw ADC; not a dB threshold.
const unsigned long SAMPLE_INTERVAL_MS = 1000;
const unsigned long WARNING_INTERVAL_MS = 5000;
const unsigned long BUZZER_PULSE_MS = 120;

SoftwareSerial bluetooth(HC05_RX_PIN, HC05_TX_PIN);
unsigned long lastSampleAt = 0;
unsigned long lastWarningAt = 0;
byte warningCount = 0;
bool alertSent = false;
bool wasNoisy = false;
unsigned long episodeNumber = 0;
String episodeId;

void sendMessage(int rawAdc, const char* status, const char* eventName) {
  bluetooth.print("{\"device_id\":\"");
  bluetooth.print(DEVICE_ID);
  bluetooth.print("\",\"location_id\":\"");
  bluetooth.print(LOCATION_ID);
  bluetooth.print("\",\"raw_adc\":");
  bluetooth.print(rawAdc);
  bluetooth.print(",\"warning_count\":");
  bluetooth.print(warningCount);
  bluetooth.print(",\"status\":\"");
  bluetooth.print(status);
  bluetooth.print("\",\"event\":\"");
  bluetooth.print(eventName);
  bluetooth.print("\",\"firmware_version\":\"");
  bluetooth.print(FIRMWARE_VERSION);
  bluetooth.print("\"");
  if (strcmp(eventName, "staffroom_alert") == 0) {
    bluetooth.print(",\"episode_id\":\"");
    bluetooth.print(episodeId);
    bluetooth.print("\"");
  }
  bluetooth.println("}");

  Serial.print("ADC=");
  Serial.print(rawAdc);
  Serial.print(" warnings=");
  Serial.print(warningCount);
  Serial.print(" event=");
  Serial.println(eventName);
}

void setup() {
  pinMode(SOUND_DIGITAL_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.begin(9600);
  bluetooth.begin(9600);
  Serial.println("NoiseMap Uno + HC-05 starting");
  Serial.println("Check DEVICE_ID and LOCATION_ID before connecting.");
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleAt < SAMPLE_INTERVAL_MS) return;
  lastSampleAt = now;

  const int rawAdc = analogRead(SOUND_ANALOG_PIN);
  const bool noisy = rawAdc >= NOISE_THRESHOLD_ADC;

  if (noisy) {
    if (!wasNoisy) {
      lastWarningAt = now;
      episodeNumber++;
      episodeId = String(DEVICE_ID) + "_" + String(episodeNumber);
      warningCount = 0;
      alertSent = false;
    }

    if (warningCount < 3 && now - lastWarningAt >= WARNING_INTERVAL_MS) {
      warningCount++;
      lastWarningAt = now;
      tone(BUZZER_PIN, 2000, BUZZER_PULSE_MS);
    }


    if (warningCount >= 3 && !alertSent) {
      sendMessage(rawAdc, "NOISE", "staffroom_alert");
      alertSent = true;
    } else {
      sendMessage(rawAdc, "NOISE", "observation");
    }
  } else {
    digitalWrite(BUZZER_PIN, LOW);
    if (wasNoisy && warningCount > 0) {
      warningCount = 0;
      sendMessage(rawAdc, "NORMAL", "warning_reset");
    } else {
      warningCount = 0;
      sendMessage(rawAdc, "NORMAL", "observation");
    }
    alertSent = false;
  }

  wasNoisy = noisy;
}
