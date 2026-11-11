#!/usr/bin/env python3
"""Bridge newline-delimited HC-05 JSON to NoiseMap's Apps Script endpoint.

The Apps Script endpoint validates the shared bridge token, writes Firestore
observations, updates device heartbeats, and emails real hardware incidents.
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

    threshold = data.get("threshold_adc", 700)
    if isinstance(threshold, bool) or not isinstance(threshold, int) or not 0 <= threshold <= 1023:
        raise ValueError("threshold_adc must be an integer from 0 to 1023")

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
        "threshold_adc": threshold,
        "warning_count": warning_count,
        "status": data["status"],
        "event": event,
        "firmware_version": str(data.get("firmware_version", "uno-hc05"))[:32],
    }
    if event == "staffroom_alert":
        payload["episode_id"] = data["episode_id"]
    return payload


def post_with_retries(endpoint, payload):
    last_error = None
    for attempt in range(3):
        try:
            response = requests.post(endpoint, json=payload, timeout=25)
            try:
                result = response.json()
            except ValueError:
                result = {"response": response.text[:200]}
            if response.ok and result.get("ok") is True:
                return result
            last_error = RuntimeError(
                f"Apps Script rejected upload ({response.status_code}): {result}"
            )
            if response.status_code < 500 and response.status_code != 429:
                raise last_error
        except requests.RequestException as exc:
            last_error = exc
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise last_error or RuntimeError("Apps Script upload failed")


def main():
    port = required_env("NOISEMAP_COM_PORT")
    endpoint = required_env("NOISEMAP_APPS_SCRIPT_URL")
    token = required_env("NOISEMAP_WEBHOOK_TOKEN")
    baud = int(os.environ.get("NOISEMAP_BAUD", "9600"))
    upload_interval = float(os.environ.get("NOISEMAP_UPLOAD_INTERVAL_SECONDS", "10"))
    if upload_interval < 1:
        raise SystemExit("NOISEMAP_UPLOAD_INTERVAL_SECONDS must be at least 1")

    print(f"NoiseMap HC-05 bridge listening on {port} at {baud} baud")
    print(f"Uploading normal readings every {upload_interval:g} seconds")
    print("Incident and reset events are uploaded immediately. Press Ctrl+C to stop.")
    print("Do not share the webhook token.")

    last_uploaded_at = 0.0
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
                now = time.monotonic()
                if message["event"] == "observation" and now - last_uploaded_at < upload_interval:
                    continue

                payload = dict(message)
                payload["webhook_token"] = token
                result = post_with_retries(endpoint, payload)
                last_uploaded_at = time.monotonic()
                print(
                    f"Saved ADC={message['raw_adc']} · event={message['event']}"
                    + (f" · email={result.get('email_status')}" if message["event"] == "staffroom_alert" else "")
                )
            except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
                print(f"Skipped serial line: {exc}", file=sys.stderr)
            except (requests.RequestException, RuntimeError) as exc:
                print(f"Upload failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBridge stopped.")
