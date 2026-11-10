# NoiseMap

**A Team Fearless project for NRL Changemakers**

NoiseMap is a prototype for recording sound observations at selected locations, understanding patterns over time, and transparently tracking follow-up actions.

## Current status

- [x] Responsive dashboard prototype
- [x] Firebase Web SDK bootstrap and reusable Firestore write helpers
- [x] Firestore security rules (authenticated accounts only)
- [x] Firebase CLI configuration and indexes manifest
- [ ] Firebase project creation and Web App configuration
- [ ] Enable Email/Password Authentication and provision team accounts
- [ ] Create Firestore database and deploy security rules
- [ ] Connect dashboard screens to Firestore read queries
- [ ] Arduino-to-web data transfer and device authentication
- [ ] Calibrated sound measurement method

**Important:** The dashboard still displays illustrative sample data. Firebase is not active until a real project configuration is added. No live sensor readings are connected. Raw LM393 analogue values or comparator outputs must not be presented as dB or dB(A).

## Staffroom browser audio alerts

The Staffroom Alerts page includes a browser-based audio monitor. An authorised team member can enable the sound toggle, test the synthesized Web Audio chime, and select a raw ADC trigger level (default 700) and sustained duration (default 5 seconds).

- The monitor evaluates only non-simulated observations whose source is `esp8266`, and requires the associated device heartbeat to be online.
- A breach is recorded only after consecutive readings remain at or above the selected threshold for the selected duration. Readings more than 15 seconds apart reset the sustained interval because continuity cannot be established.
- Each browser-detected incident is saved to the existing staff-only `alerts` collection with an idempotent incident ID, threshold, duration, device, and raw ADC reading.
- The sound preference is stored in that browser. The browser page must remain open, the user must be signed in as an authorised team member for incident logging, and browser audio must be enabled by a user gesture.
- Simulated and manually entered observations are excluded. Hardware firmware alerts continue to use the existing authenticated `staffroom_alert` event flow.

**Measurement limitation:** This feature uses raw ADC thresholds only. It does not measure calibrated dB/dB(A), identify a sound source, or establish a legal noise violation. The 15-second sample-gap rule is a software safeguard; confirm that the device firmware sends readings frequently enough before relying on the monitor in a live classroom.


## GitHub Pages deployment

The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`. When changes are pushed to `main`, it packages only the static website files (`index.html`, `css/style.css`, and the browser scripts in `js/`) and deploys them to GitHub Pages. It does not deploy Firebase Functions or Firestore rules.

**One-time repository setting:** Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. After this is selected, merges to `main` trigger deployment automatically. The deployment URL and status appear under the workflow run and in **Settings → Pages**.

GitHub Pages hosts the front-end only. Firebase Authentication and Firestore will remain unavailable until the Firebase Web App configuration is added and the Firebase services/rules are deployed separately.


## Repository structure

```
NoiseMap/
├── index.html
├── css/style.css
├── js/app.js
├── js/firebase.js
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── README.md
```

## 1. Create and configure Firebase (one-time account-owner step)

1. Open https://console.firebase.google.com/ and create a project named **NoiseMap** (or use an existing project dedicated to this prototype).
2. In Project settings, add a **Web app** named `NoiseMap Web`.
3. Copy the Firebase Web App configuration values.
4. Open `js/firebase.js` in this repository. Replace the `window.NOISEMAP_FIREBASE_CONFIG` placeholder values with the values from the Firebase Console. Do not add a service-account JSON file or Admin SDK private key.
5. In **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**.
6. In **Authentication → Users**, add the individual team accounts. This prototype intentionally has no public sign-up form: only accounts you create in the Firebase Console can sign in.
7. In **Build → Firestore Database**, create a database. Choose a region close to your users and keep the project in production mode.
8. From the repository root, install Firebase CLI, sign in with the project owner's Google account, select the project, then deploy the rules:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,firestore:indexes
   ```
9. Confirm the rules deployment in Firebase Console → Firestore → Rules.

## 2. Firestore security

`firestore.rules` denies access by default and allows read/write only when a user is authenticated. Because there is no public registration, the project owner controls which accounts are provisioned. All provisioned users currently have equal data permissions; role-based permissions and audit logging should be added before wider deployment or sensitive use.

Do not use open test rules such as `allow read, write: if true`.

## 3. Data model

The client helpers in `js/firebase.js` prepare these collections:

- `locations`: name, description, status, createdAt, createdBy.
- `devices`: deviceId, locationId, hardware, connectionStatus, createdAt, createdBy.
- `observations`: deviceId, locationId, timestamp, rawValue, measurementType, unit, calibration, createdAt, createdBy.
- `actions`: observationId, description, actionDate, responsible, responseStatus, evidenceUrl, createdAt, createdBy.

The observation helper defaults to `measurementType: "raw_adc"` and `unit: "ADC (0-1023)"`. Do not store or display LM393 readings as dB/dB(A) without suitable calibrated measurement hardware and a documented calibration method.

## 4. Client helper usage

After Firebase is configured, the page exposes `window.NoiseMap`:

- `NoiseMap.signIn(email, password)`
- `NoiseMap.signOut()`
- `NoiseMap.onAuthStateChanged(callback)`
- `NoiseMap.addLocation(data)`
- `NoiseMap.addDevice(data)`
- `NoiseMap.addObservation(data)`
- `NoiseMap.addAction(data)`

These helpers are a foundation, not a finished dashboard integration. The current page does not yet render Firestore records or include a login form. Do not treat the demo chart/cards as database content.

## 5. Publish

GitHub Pages can host the static site:

1. Repository **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.
4. Wait for the Pages URL to appear.

The Firebase Web App config is client-side configuration and will be visible to site visitors. Firestore rules—not secrecy of the config—must protect the data.

## Hardware and measurement integrity

The current hardware concept is Arduino UNO + LM393 sound sensor + buzzer + HC-05 Bluetooth. Hardware data transfer is not implemented here yet. A raw ADC number is a sensor signal, not a sound-pressure level. Do not claim dB/dB(A), exceedance, or regulatory compliance without appropriate calibrated instrumentation and a documented measurement process.

## Team

**Team Fearless** · NRL Changemakers
