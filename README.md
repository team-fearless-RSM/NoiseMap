# NoiseMap

**A Team Fearless project for NRL Changemakers**

NoiseMap is a prototype concept for recording sound observations at selected locations, understanding patterns over time, and transparently tracking follow-up actions.

## Current status

- [x] Initial responsive dashboard UI
- [x] Overview, Locations, Devices, Historical Data, Action Tracker, and About sections
- [x] Clearly labelled sample data for preview
- [ ] Firebase project and Firestore connection
- [ ] Team authentication and access roles
- [ ] Arduino-to-web data transfer
- [ ] Real observation storage and historical charts
- [ ] Calibrated sound measurement method

**Important:** The current dashboard uses illustrative sample data only. No live sensor readings are connected. Raw LM393 analogue values or comparator outputs must not be presented as dB or dB(A). A calibrated measurement instrument and documented method are required before publishing sound-pressure levels.

## Repository structure

```
NoiseMap/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   └── firebase.js
└── README.md
```

## Preview locally

1. Download or clone this repository.
2. Open the folder in Visual Studio Code.
3. Open `index.html` in a browser, or use the VS Code Live Server extension.

No build step is required for the current static prototype.

## Publish with GitHub Pages

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**, then save.
4. Wait for GitHub Pages to finish publishing. The public site URL will appear in the Pages settings.

## Firebase plan

Firebase will be used for the shared data layer, not GitHub. The planned responsibilities are:

- **Firebase Authentication:** team sign-in.
- **Cloud Firestore:** locations, devices, observations, and action records.
- **GitHub:** shared source code, version history, and collaboration.
- **GitHub Pages:** hosting the static website prototype.

Before adding live data, define who can read, create, edit, and delete records. Apply Firestore security rules; do not use open test rules for a public deployment. Never commit service-account private keys.

## Suggested future data collections

- `locations` — verified location name, description, and status.
- `devices` — device identifier, assigned location, hardware details, and connection status.
- `observations` — device, location, timestamp, raw sensor value, measurement type, and calibration metadata where applicable.
- `actions` — observation reference, action description, date, responsible team member, and verified response status.

Keep raw sensor values distinct from calibrated dB/dB(A) measurements.

## Team

**Team Fearless** · NRL Changemakers
