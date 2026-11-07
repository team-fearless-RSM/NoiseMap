# NoiseMap device ingestion function

This HTTPS endpoint accepts JSON observations from a registered ESP8266 and writes them to Firestore using the Firebase Admin SDK. Admin credentials are never placed in the device or browser.

## Before deployment

- Firebase project: noisemap-ead56.
- Cloud Functions deployment requires the Blaze (pay-as-you-go) plan and a billing account. Usage may fit within no-cost quotas, but billing must be enabled. Set a budget alert first.
- Install Node.js 20 and Firebase CLI, then sign in:

```sh
npm install -g firebase-tools
firebase login
firebase projects:list
```

## Install and deploy

From the repository root:

```sh
cd functions
npm install
cd ..
firebase deploy --project noisemap-ead56 --only functions:ingestDeviceData
```

The deploy output provides the HTTPS URL. The function is configured for asia-south1.

Deploy the repository Firestore rules separately if they have not already been published:

```sh
firebase deploy --project noisemap-ead56 --only firestore:rules
```

## Register a device

1. In the NoiseMap team dashboard, create a location and note its Firestore document ID.
2. Create a device record with a unique deviceId (example: classroom-01-device) and assign it to that exact location. The ID may contain only letters, numbers, underscores or hyphens.
3. Generate a private device token on a trusted computer. Do not paste it into GitHub or a public chat:

```sh
node -e "const c=require('crypto'); const t=c.randomBytes(32).toString('hex'); console.log('DEVICE_TOKEN='+t); console.log('TOKEN_HASH='+c.createHash('sha256').update(t).digest('hex'))"
```

4. In Firebase Console > Firestore Database, create a document in the deviceSecrets collection. Set its document ID to the exact deviceId. Add one string field named tokenHash containing only the generated hash. Never store the raw token in Firestore.
5. Keep the raw DEVICE_TOKEN private for the device firmware. If exposed, replace the hash; deleting the document immediately revokes that device access.

The deviceSecrets collection is not readable or writable by website clients under the repository Firestore rules. The Cloud Function uses the Admin SDK to read it.

## Request format

Send an HTTPS POST with header Authorization: Bearer DEVICE_TOKEN and JSON body:

```json
{
  "device_id": "classroom-01-device",
  "location_id": "FIRESTORE_LOCATION_DOCUMENT_ID",
  "raw_adc": 21,
  "status": "NOISE",
  "warning_count": 3,
  "event": "staffroom_alert",
  "episode_id": "boot123_episode04",
  "firmware_version": "0.1.0"
}
```

For ordinary samples, use event = observation and omit episode_id. For a staffroom alert, warning_count must equal 3 and episode_id must uniquely identify that continuous noise episode. Repeated alert requests for the same device and episode create only one alert document.

The endpoint checks the device credential, registered device, assigned location, ADC range (0–1023), status and warning count. It uses Firestore server timestamps.

## Data and limitations

- raw_adc is a prototype peak-to-peak ADC activity value, not calibrated dB or dB(A).
- Observations are written to the observations collection using existing website field names.
- Staffroom alerts are written to alerts; repository rules allow public reading and team-only editing, matching the current dashboard listener. Do not put personal or sensitive data in alert documents.
- The endpoint source is prepared but is not deployed until an administrator completes billing, CLI, device registration and token setup.
