# NoiseMap

**Team Fearless · NRL Changemakers**

NoiseMap is a prototype for recording sound-sensor observations at selected locations, viewing patterns over time, and tracking follow-up actions. The hardware path is **Arduino Uno + LM393 4-pin sound sensor + HC-05 Bluetooth**, with a paired computer running the Python bridge.

## Current implementation

- Firebase web client and Firestore-backed dashboard.
- Device registration in the \`devices\` collection and location assignment.
- Arduino Uno firmware: \`hardware/arduino_uno_hc05.ino\`.
- HC-05 serial bridge: \`bridge/serial_to_cloud.py\`.
- Google Apps Script backend: \`apps-script/Code.gs\`.
- Firestore REST API writes for observations, device heartbeats, and hardware alerts.
- Email sent by Google Apps Script MailApp after a real sensor incident reaches warning 3 of 3.
- Browser Staffroom audio alerts for fresh, consecutive, authenticated Uno/HC-05 readings.
- Simulator records remain separate from real hardware events.

The Apps Script path replaces the Firebase Cloud Functions ingestion and email-trigger path. It does not require Firebase Cloud Functions deployment or Firebase Secret Manager. Firestore remains the database.

## Measurement integrity

The LM393 module's analogue output is a raw ADC signal (0–1023), not calibrated sound pressure. NoiseMap must not label these values as dB/dB(A), claim source identification (for example, traffic versus voices), or claim regulatory exceedance without suitable calibrated instrumentation and a documented method. The firmware threshold is a tunable raw-ADC threshold only.

## Data path

1. LM393 AO connects to Arduino A0.
2. Arduino sends newline-delimited JSON over HC-05 Bluetooth serial.
3. A paired Windows/Linux computer runs \`bridge/serial_to_cloud.py\` and reads the HC-05 outgoing COM port.
4. The bridge forwards selected readings and all alert/reset events to a Google Apps Script web app using a existing device secret.
5. Apps Script validates the registered device and its assigned location, then writes observations and device heartbeats through the Firestore REST API.
6. When a real hardware event arrives with \`event: "staffroom_alert"\` and \`warning_count: 3\`, Apps Script creates the Firestore alert and sends one email to \`guruprasad.kothavale@iteachschools.org\`.
7. The dashboard continues reading the same Firestore collections.

The Uno does not connect directly to the website. The paired computer, Bluetooth connection, and bridge must remain running for uploads.

## Setup

### 1. Configure Google Cloud / Firestore access

The Firebase project is \`noisemap-ead56\`. Firestore must already be enabled in this project.

The Google account that owns/runs the Apps Script web app must have the **Cloud Datastore User** IAM role on this Google Cloud project. This lets the script use the Firestore REST API with its Google OAuth token. The script uses the \`datastore\` OAuth scope; it does not use a Firebase Admin service account key.

Do not loosen Firestore Security Rules to make this work. The script uses Google identity/IAM for its Firestore REST requests; the public website continues to use the existing Firebase client and Security Rules.

### 2. Reuse the existing Google Apps Script project

Do **not** create another Apps Script project. The current NoiseMap deployment already uses Firebase project `noisemap-ead56`, the existing `NM_DEVICE_SECRET` Script Property, and the deployed Web App URL stored in `NM_WEB_APP_URL`.

1. Open the existing Apps Script project that contains your current NoiseMap code.
2. Replace its `Code.gs` contents with the updated `apps-script/Code.gs` from this repository. This preserves the existing functions and adds support for Arduino Uno + HC-05 events.
3. Confirm the Script Property `NM_DEVICE_SECRET` already exists. If it is missing, run `createNoiseMapDeviceSecret()` once, then run `logNoiseMapDeviceSecretForBridge()`.
4. Run `logNoiseMapDeviceSecretForBridge()` to display the existing secret in the private Apps Script execution log. Copy it directly into the bridge computer's environment. **Never paste it into chat, GitHub, Arduino firmware, or the website.**
5. Run `testNoiseMapFirestore()` and `testNoiseMapEmail()` if you need to verify Firestore and email permissions.
6. Open **Deploy → Manage deployments**, edit the existing Web App deployment, select **New version**, and deploy. Keep the existing deployment URL and its access settings.
7. Check **Triggers** in the Apps Script editor. Confirm that `pollNoiseMapAlerts` has a five-minute time-driven trigger. Only if it is missing, run `installNoiseMapFiveMinuteTrigger()` once.

The Google account running the Apps Script must have the **Cloud Datastore User** IAM role on Firebase project `noisemap-ead56`. Emails are sent by the Google account that owns/runs the script. A real hardware alert is saved immediately, and the scheduled monitor sends its email on the next run (normally within five minutes).

### 3. Configure the bridge computer

Install dependencies:

\`\`\`powershell
py -m pip install pyserial requests
\`\`\`

Generate a private device secret locally:

\`\`\`powershell
py -c "import secrets; print(secrets.token_urlsafe(32))"
\`\`\`

Copy the generated value into the Apps Script Script Property \`NOISEMAP_DEVICE_SECRET\`. Then set the same value in the bridge computer's environment. Do not send it in chat, commit it, or put it in Arduino firmware.

Set these PowerShell variables for the current terminal session:

\`\`\`powershell
$env:NOISEMAP_COM_PORT = "COM7"
$env:NOISEMAP_BAUD = "9600"
$env:NOISEMAP_APPS_SCRIPT_URL = "<your Apps Script /exec URL>"
$env:NOISEMAP_DEVICE_SECRET = "<the existing NM_DEVICE_SECRET value>"
$env:NOISEMAP_UPLOAD_INTERVAL_SECONDS = "10"
py .\bridge\serial_to_cloud.py
\`\`\`

Replace COM7 and the web app URL with your actual values; use the existing device secret copied from Apps Script. The bridge uploads normal observations every 10 seconds to keep usage controlled. It uploads \`staffroom_alert\` and \`warning_reset\` events immediately. Keep the bridge running while collecting data.

### 4. Register the hardware device and configure Arduino

The device must already exist in the NoiseMap dashboard's \`devices\` collection, with:
- \`deviceId\`: the exact ID entered in the Arduino sketch.
- \`locationId\`: the Firestore document ID of the assigned location.

Open \`hardware/arduino_uno_hc05.ino\` in Arduino IDE and replace:
- \`DEVICE_ID\` with the exact registered device ID.
- \`LOCATION_ID\` with the assigned Firestore location document ID.

Wiring is documented at the top of the sketch. Arduino D11 is 5V logic; connect it to HC-05 RX through a resistor voltage divider or level shifter. Do not connect Arduino TX directly to HC-05 RX. The sketch uses SoftwareSerial at 9600 baud for HC-05 and USB Serial at 9600 for diagnostics.

Tune \`NOISE_THRESHOLD_ADC\` from observed raw readings in the intended environment. It is not a dB threshold. The sketch counts one warning after each five-second sustained high interval and sends a staffroom alert at the third warning.

### 5. Test the email alert

1. Confirm the existing Apps Script web app URL and device secret are configured on the bridge computer.
2. Confirm the device exists in Firestore and its \`locationId\` matches the Arduino sketch.
3. Start the bridge and power the Arduino/HC-05 sensor.
4. Create a sustained sensor reading above the configured threshold for three warning intervals.
5. Confirm the bridge prints \`event=staffroom_alert · email=sent\`.
6. Check the inbox for \`guruprasad.kothavale@iteachschools.org\`.
7. In Firestore, inspect the new \`alerts/{deviceId_episodeId}\` document for \`emailStatus: "sent"\`.

If an alert fails, check **Apps Script → Executions** for the error. The alert monitor uses the existing script lock and sent marker to reduce duplicate email attempts.

## Usage and cost notes

- Firebase Cloud Functions and Firebase Secret Manager are not used by this Apps Script bridge.
- Firestore has a no-cost daily allowance on the Spark plan: 20,000 document writes and 50,000 document reads per day. The bridge defaults to one observation every 10 seconds (8,640 observation writes/day) plus a heartbeat about once per minute (up to 1,440 more writes/day). Other dashboard activity also uses the project's quota. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).
- Apps Script also has account-specific daily URL Fetch and email quotas. The published URL Fetch quota is 20,000 calls/day for consumer accounts and 100,000 for Workspace accounts; email recipient quotas also vary by account type. These limits can change. See [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
- This is designed for a low-volume school prototype, not guaranteed unlimited or 24/7 production service. If quotas are exceeded, Apps Script or Firestore may reject writes until quotas reset or the project is moved to a paid plan.
- The device secret is a shared credential. Keep it only in Apps Script Script Properties and the bridge computer's environment variables. Rotate it in both places if it is exposed.

## Browser Staffroom audio alerts

An authorised team member must sign in, open Staffroom Alerts, enable the audio toggle with a user gesture, and keep that page open. The monitor only evaluates fresh, consecutive, online readings from source \`arduino_uno_hc05\`; simulated records are excluded. Browser audio cannot play when the page is closed or suspended.

## Firestore collections

- \`locations\`: classroom/site locations.
- \`devices\`: registered device ID, assigned location, hardware, heartbeat and connection status.
- \`observations\`: timestamped raw ADC readings and source metadata.
- \`alerts\`: staffroom alerts and browser-detected sustained-threshold incidents.
- \`actions\`: follow-up/action-tracking records.
- \`teamMembers\`: allowlisted team user IDs.

The legacy \`functions/\` source is retained for reference/rollback but is not part of the new bridge path. Do not run the old Firebase Functions deployment workflow for this setup. If Cloud Functions were already deployed in this Firebase project, review and remove those old functions separately after confirming no other workflow uses them.

## GitHub Pages

The repository's Pages workflow deploys the static website only. It does not deploy Apps Script, Firestore rules, or Firestore data.
