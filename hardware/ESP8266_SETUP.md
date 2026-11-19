# NoiseMap ESP8266 + LM393 Wi-Fi integration

This firmware adds a direct Wi-Fi hardware path alongside the existing Uno + HC-05 bridge.

## Fixed device configuration

- Device ID: `NM-SIM-01`
- Location document ID: `420`
- Hardware source: `esp8266_lm393`
- Firebase project: `noisemap-ead56`
- Upload interval: 10 seconds
- Heartbeat interval: 30 seconds

The location ID must be the actual Firestore document ID under `locations`, and that location must have `status: "active"`.

## Wiring

Use a NodeMCU development board with its onboard A0 voltage divider:

| LM393 4-pin module | NodeMCU ESP8266 |
|---|---|
| VCC | 3V3 |
| GND | GND |
| AO | A0 |
| DO | D5 (GPIO14) |

The LM393 digital output is only a threshold signal. The analog output is raw ADC data, not sound pressure and not calibrated dB(A). The current prototype deliberately sends observations only; it does not create alerts while the sensor response is still unverified.

**ADC warning:** the bare ESP8266 chip ADC input is limited to 0–1.0 V. Some NodeMCU development boards add an onboard divider so the board's A0 pin accepts approximately 0–3.3 V. Confirm the exact board before connecting AO. Never apply more than the board's A0 rating.

## 1. Prepare the device record

The Apps Script file contains a one-time helper:

`activateNoiseMapEsp8266Device()`

It is configured for device `NM-SIM-01` and location `420`. After updating and deploying Apps Script, run this function manually from the Apps Script editor. It verifies that exactly one device exists and that the location exists and is active. It then sets the device to active, assigns location 420, and records the hardware name as `NodeMCU ESP8266 + LM393 4-pin`.

If it reports that the device or location is missing, stop and correct the IDs in the constants at the top of `apps-script/Code.gs`. Do not create a duplicate device record.

## 2. Update the existing Apps Script deployment

1. Open the existing NoiseMap Apps Script project.
2. Replace its `Code.gs` with the repository's updated `apps-script/Code.gs`.
3. Preserve the existing Script Property named `NM_DEVICE_SECRET`. Do not generate a new secret if one already exists.
4. Deploy → Manage deployments → Edit the existing Web App deployment → select **New version** → Deploy.
5. Keep the same Web App URL and access settings.
6. Run `activateNoiseMapEsp8266Device()` once and confirm it completes successfully.
7. Do not paste the device secret into GitHub, chat, or the website.

## 3. Create the private firmware secrets file

1. In the repository's `hardware` folder, copy `esp8266_secrets.example.h`.
2. Rename the copy to `esp8266_secrets.h`.
3. Fill in your Wi-Fi SSID and password.
4. Copy the existing `NM_DEVICE_SECRET` from Apps Script → Project Settings → Script Properties (or the private execution log from the existing secret helper) into `NOISEMAP_DEVICE_SECRET`.
5. Do not commit `esp8266_secrets.h`. It is excluded by `.gitignore`.

For a school Wi-Fi network that uses a captive portal or enterprise login, the ESP8266 may not be able to join directly. Use a normal WPA2-Personal hotspot/router for the first test if needed.

## 4. Upload firmware

1. Install the ESP8266 board package in Arduino IDE if it is not already installed.
2. Select **NodeMCU 1.0 (ESP-12E Module)** (or the exact matching board).
3. Select the correct COM port.
4. Open `hardware/esp8266_lm393_wifi.ino`.
5. Ensure `esp8266_secrets.h` is in the same folder as the sketch.
6. Upload.
7. Open Serial Monitor at **115200 baud**.

Expected sequence:
- Wi-Fi connected and IP address displayed.
- Apps Script heartbeat returns an HTTP success response containing `"ok":true`.
- Every 10 seconds the sketch prints ADC average/min/max and sends an observation.
- Apps Script reports `Reading received.`; the dashboard receives a physical record with `source: "esp8266_lm393"` and `isSimulated: false`.

If the heartbeat is rejected, check the Apps Script Executions log. Common causes are a device still marked planned, location 420 missing/inactive, wrong device secret, or an old Web App deployment.

## 5. Security and measurement notes

The sketch currently uses TLS encryption with certificate verification disabled (`setInsecure()`) for a straightforward prototype connection to Apps Script. This is not ideal for production; install and validate the correct trusted CA certificate before public deployment.

The LM393 readings must remain labelled **raw ADC (0–1023)**. Do not interpret them as dB/dB(A), and do not enable automatic noise alerts until the microphone produces a repeatable response and the alert threshold is independently validated.
