# NoiseMap HC-05 serial-to-cloud bridge

The Arduino Uno has no Wi-Fi or native HTTPS connection. The HC-05 is a
Bluetooth Classic serial module; it does not send data directly to a website.
This small bridge runs on a paired computer, reads newline-delimited JSON from
the HC-05 Bluetooth COM port, and forwards each reading to NoiseMap's
authenticated HTTPS ingestion function.

## 1. Install on the computer paired with HC-05

```powershell
py -m pip install pyserial requests
```

Pair the HC-05 in Windows Bluetooth settings. In Device Manager, identify the
**outgoing** Bluetooth COM port created for the paired module.

## 2. Configure the bridge

Set these environment variables in PowerShell (replace the placeholders):

```powershell
$env:NOISEMAP_COM_PORT = "COM7"
$env:NOISEMAP_BAUD = "9600"
$env:NOISEMAP_INGEST_URL = "<the deployed ingestDeviceData HTTPS URL>"
$env:NOISEMAP_DEVICE_TOKEN = "<the provisioned device token>"
py .\bridge\serial_to_cloud.py
```

Do not commit the URL if it contains sensitive query parameters, and never
commit or share the device token. The bridge requires a valid token already
provisioned for the registered device in Firestore's `deviceSecrets`
collection. Device registration in the website alone does not create that
credential.

## 3. Serial message format expected from the Arduino

Send one complete JSON object followed by a newline for each observation:

```json
{"device_id":"NM-CLASS-01","location_id":"<Firestore location document ID>","raw_adc":420,"warning_count":0,"status":"NORMAL","event":"observation","firmware_version":"uno-hc05-v1"}
```

For a firmware-generated alert episode, send:

```json
{"device_id":"NM-CLASS-01","location_id":"<Firestore location document ID>","raw_adc":820,"warning_count":3,"status":"NOISE","event":"staffroom_alert","episode_id":"episode001","firmware_version":"uno-hc05-v1"}
```

The alert event must be emitted only after the device's own warning logic has
reached three warnings. Use a new episode ID for each distinct incident.
The server validates the device token, registered device, assigned location,
ADC range, warning count and event fields before saving.

## Important limitations

- This is a **computer bridge**, not a direct browser-to-HC-05 connection.
  The paired computer and this script must remain running for uploads.
- This script has not been tested against the physical Uno/HC-05 hardware yet.
- It does not provision device tokens. The project owner must securely create
  and store the device token hash in `deviceSecrets/{deviceId}`.
- The current ingestion function writes the source label `esp8266` for
  authenticated uploads. That is a legacy label, not board identification.
  Do not infer the physical board from that field.
- Browser audio monitoring still requires fresh consecutive authenticated
  observations and an online heartbeat. Simulated observations remain excluded.
- LM393 ADC values are raw sensor signals, not calibrated dB or dB(A).
