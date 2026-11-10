#!/usr/bin/env python3
"""Bridge newline-delimited JSON from an HC-05 Bluetooth COM port to NoiseMap.

The Arduino/HC-05 sends one JSON object per line. This bridge runs on a paired
Windows/Linux computer and forwards each validated message over HTTPS.
It does not create or store device credentials.
"""
import json
import os
import sys
import time

import requests
import serial


def required_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing environment variable: {name}")
    return value


def validate_message(data):
    if not isinstance(data, dict):
        raise ValueError("Each serial line must be a JSON object")

    for key in ("device_id", "location_id"):
        value = data.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"Missing {key}")

    raw = data.get("raw_adc")
    if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= 1023:
        raise ValueError("raw_adc must be an integer from 0 to 1023")

    warning_count = data.get("warning_count", 0)
    if isinstance(warning_count, bool) or not isinstance(warning_count, int) or not 0 <= warning_count <= 3:
        raise ValueError("warning_count must be an integer from 0 to 3")

    if data.get("status") not in ("NOISE", "NORMAL"):
        raise ValueError("status must be NOISE or NORMAL")

    event = data.get("event", "observation")
    if event not in ("observation", "staffroom_alert", "warning_reset"):
        raise ValueError("Unsupported event")

    if event == "staffroom_alert":
        episode_id = data.get("episode_id")
        if warning_count != 3 or not isinstance(episode_id, str) or len(episode_id) < 6:
            raise ValueError("staffroom_alert requires warning_count=3 and episode_id")

    payload = {
        "device_id": data["device_id"],
        "location_id": data["location_id"],
        "raw_adc": raw,
        "warning_count": warning_count,
        "status": data["status"],
        "event": event,
        "firmware_version": str(data.get("firmware_version", "uno-hc05"))[:32],
    }
    if event == "staffroom_alert":
        payload["episode_id"] = data["episode_id"]
    return payload


def main():
    port = required_env("NOISEMAP_COM_PORT")
    endpoint = required_env("NOISEMAP_INGEST_URL")
    token = required_env("NOISEMAP_DEVICE_TOKEN")
    baud = int(os.environ.get("NOISEMAP_BAUD", "9600"))

    print(f"NoiseMap HC-05 bridge listening on {port} at {baud} baud")
    print("Press Ctrl+C to stop. Do not share the device token.")

    with serial.Serial(port, baudrate=baud, timeout=1) as bluetooth:
        time.sleep(2)
        while True:
            raw_line = bluetooth.readline()
            if not raw_line:
                continue
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                message = validate_message(json.loads(line))
                response = requests.post(
                    endpoint,
                    json=message,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10,
                )
                try:
                    result = response.json()
                except ValueError:
                    result = {"response": response.text[:200]}
                if response.ok and result.get("ok") is True:
                    print(f"Saved ADC={message['raw_adc']} · event={message['event']}")
                else:
                    print(f"Upload rejected ({response.status_code}): {result}", file=sys.stderr)
            except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
                print(f"Skipped serial line: {exc}", file=sys.stderr)
            except requests.RequestException as exc:
                print(f"Network upload failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBridge stopped.")
