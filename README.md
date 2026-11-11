# NoiseMap

**Team Fearless · NRL Changemakers**

NoiseMap is a prototype for recording sound-sensor observations at selected locations, viewing patterns over time, and tracking follow-up actions. The current hardware path is **Arduino Uno + LM393 4-pin sound sensor + HC-05 Bluetooth**, with a paired-computer bridge forwarding readings to Firebase.

## Current implementation

- Firebase web client and Firestore-backed dashboard.
- Device registration in the `devices` collection and location assignment.
- Authenticated HTTPS ingestion function: `ingestDeviceData`.
- HC-05 serial-to-cloud bridge: `bridge/serial_to_cloud.py`.
- Arduino firmware starter sketch: `hardware/arduino_uno_hc05.ino`.
- Local device-token provisioning utility: `functions/scripts/provision-device.js`.
- Browser Staffroom audio alerts for fresh, consecutive, authenticated Uno/HC-05 readings.
- Simulator records are marked separately and excluded from live sensor alerts.

**Not yet verified on physical hardware:** the Uno/HC-05 firmware, Bluetooth COM-port bridge, deployed ingestion function, and a real end-to-end upload. A GitHub commit does not deploy Firebase Functions.

## Measurement integrity

The LM393 module's analogue output is a raw ADC signal (0–1023), not calibrated sound pressure. NoiseMap must not label these values as dB/dB(A), claim source identification (for example, traffic versus voices), or claim regulatory exceedance without suitable calibrated instrumentation and a documented method. The firmware threshold is a tunable raw-ADC threshold only.

## Data path

1. LM393 AO connects to Arduino A0.
2. Arduino sends newline-delimited JSON over HC-05 Bluetooth serial.
3. A paired Windows/Linux computer runs `bridge/serial_to_cloud.py` and reads the HC-05 outgoing COM port.
4. The bridge sends HTTPS requests with a bearer device token to `ingestDeviceData`.
5. The function validates the token hash, registered device, assigned Firestore location, and payload before saving observations and updating the device heartbeat.
6. The dashboard reads Firestore. The Staffroom audio monitor requires an authorised team session and a page that remains open.

The Uno does not connect directly to the website. The paired computer and bridge must remain running for uploads.

## Setup and deployment

### 1. Firebase Functions

From the repository root, select the correct Firebase project if it is not already selected. Then:

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
```

Use the exact `ingestDeviceData` HTTPS URL printed by the Firebase CLI after deployment. Functions deployment is separate from GitHub Pages.

### 2. Provision a device credential

The device must already be registered in the NoiseMap dashboard and assigned to a Firestore location. The `deviceId` in the website must exactly match the ID in the Arduino sketch.

Install Google Cloud CLI and authenticate locally with an account that has permission to write Firestore:

```powershell
gcloud auth application-default login
cd functions
npm install
node .\scripts\provision-device.js NM-CLASS-01
```

Replace `NM-CLASS-01` with the registered device ID. The script stores only a SHA-256 token hash in `deviceSecrets/{deviceId}` and prints the raw token once after saving. Copy it directly into the bridge computer's `NOISEMAP_DEVICE_TOKEN` environment variable. Do not put the token in Arduino firmware, browser code, GitHub, screenshots, or chat.

To invalidate an existing token and create a replacement, run the same command with `--rotate`. The old token stops working immediately.

### 3. Arduino and sensor

Open `hardware/arduino_uno_hc05.ino` in Arduino IDE. Replace:
- `DEVICE_ID` with the exact registered device ID.
- `LOCATION_ID` with the Firestore document ID of the assigned location.

Wiring is documented at the top of the sketch. Important: Arduino D11 is 5V logic; connect it to HC-05 RX through a resistor voltage divider or level shifter. Do not connect Arduino TX directly to HC-05 RX. The sketch uses SoftwareSerial at 9600 baud for HC-05 and USB Serial at 9600 for diagnostics.

Tune `NOISE_THRESHOLD_ADC` from observed raw readings in the intended environment. It is not a dB threshold. The sketch counts one warning after each five-second sustained high interval and sends a staffroom alert at the third warning.

### 4. Run the computer bridge (Windows PowerShell)

Pair the HC-05 in Windows Bluetooth settings and identify its **outgoing** Bluetooth COM port in Device Manager. Install dependencies:

```powershell
py -m pip install pyserial requests
```

Set the values for the paired computer session:

```powershell
$env:NOISEMAP_COM_PORT = "COM7"
$env:NOISEMAP_BAUD = "9600"
$env:NOISEMAP_INGEST_URL = "<deployed ingestDeviceData HTTPS URL>"
$env:NOISEMAP_DEVICE_TOKEN = "<token printed by the provisioning script>"
py .\bridge\serial_to_cloud.py
```

Replace COM7 and both placeholders with the actual values. Keep the bridge running while collecting data. Never commit the token or a local environment file.

### 5. Staffroom browser audio alerts

An authorised team member must sign in, open Staffroom Alerts, enable the audio toggle with a user gesture, and keep that page open. The monitor uses the configured raw-ADC threshold and sustained duration. It only evaluates fresh, consecutive, online readings from source `arduino_uno_hc05`; simulated records are excluded. Browser audio cannot play when the page is closed or suspended.

## Firestore collections

- `locations`: classroom/site locations.
- `devices`: registered device ID, assigned location, hardware, heartbeat and connection status.
- `deviceSecrets`: private server-side token hashes; Firestore client rules deny access.
- `observations`: timestamped raw ADC readings and source metadata.
- `alerts`: staffroom alerts and browser-detected sustained-threshold incidents.
- `actions`: follow-up/action-tracking records.
- `teamMembers`: allowlisted team user IDs.

Never weaken Firestore rules to make device ingestion work. The HTTPS function uses Firebase Admin SDK and validates device credentials independently of browser authentication.

## GitHub Pages

The repository's Pages workflow deploys the static website only. It does not deploy Firebase Functions or Firestore rules. Confirm the workflow run and Pages settings separately after pushing changes.
