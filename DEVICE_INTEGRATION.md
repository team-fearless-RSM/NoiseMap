# NoiseMap Device-to-Cloud Integration Plan

## Goal

A classroom ESP8266 reads the LM393 sensor, calculates the prototype sound-activity state and warning count, then sends observations over Wi-Fi. Firebase stores the records and the NoiseMap dashboard displays them.

## Agreed device message format

The firmware should send one JSON object per observation. Example values below are illustrative only:

```json
{
  "device_id": "classroom-01-device",
  "location_id": "school-classroom-01",
  "raw_adc": 21,
  "status": "NOISE",
  "warning_count": 2,
  "event": "observation",
  "firmware_version": "0.1.0"
}
```

Allowed status values: `NOISE`, `NORMAL`.
Allowed event values: `observation`, `staffroom_alert`, `warning_reset`.

- `raw_adc` is a prototype peak-to-peak ADC activity value (0–1023), not dB or dB(A).
- `warning_count` is the device's current warning count (0–3).
- `device_id` and `location_id` must match records configured by authorised team members.
- Device timestamps should be added by the receiving server using server time, not trusted from the device clock.

## Firestore mapping

For an ordinary observation, create a document in `observations` using the existing website data model:

- `deviceId`: message `device_id`
- `locationId`: message `location_id`
- `rawValue`: message `raw_adc`
- `measurementType`: `raw_adc`
- `unit`: `ADC (0-1023)`
- `timestamp` and `createdAt`: server timestamps
- `source`: `esp8266` (add this field when the ingestion endpoint is implemented)

When `event` is `staffroom_alert` and `warning_count` is 3, create one document in `alerts` with the classroom name/location, raw ADC value, warning count, status `open`, source `esp8266`, and a server timestamp. The firmware/ingestion layer must prevent repeated alert creation for the same continuous noise episode.

## Security and network design

The ESP8266 will connect to the classroom's 2.4 GHz Wi-Fi. It must not contain a Firebase service-account key, Admin SDK credential, or a team member's email/password.

The current Firestore rules allow public reads but restrict writes in the project collections to signed-in team members. Therefore, do not weaken those rules or put a team login password in device firmware. The intended production path is:

1. ESP8266 sends HTTPS JSON to a small authenticated ingestion endpoint (for example, a Firebase Cloud Function).
2. The endpoint validates a per-device credential, device/location registration, field types and allowed values.
3. The endpoint writes observations/alerts to Firestore using server-side credentials.
4. The public dashboard reads approved observations; staffroom alert visibility should follow the team's chosen privacy rule.

A per-device credential must be unique and revocable. Do not commit it to this public repository. Store secrets in the server's secret manager.

## Current implementation status

- Website Firebase client and team sign-in exist.
- Firestore collections used by the website include `locations`, `devices`, `observations`, `actions`, and `alerts`.
- Arduino UNO currently produces serial JSON for bench testing.
- ESP8266 firmware, Wi-Fi transmission, secure ingestion endpoint and live device-fed dashboard are not yet implemented.
- The sensor threshold remains provisional until classroom trials.
