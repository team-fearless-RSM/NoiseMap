const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();

function send(res, status, body) {
  return res.status(status).json(body);
}

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(value);
}

function validEpisodeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

exports.ingestDeviceData = onRequest(
  { region: "asia-south1", cors: false, maxInstances: 3 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return send(res, 405, { ok: false, error: "POST only" });
    }

    const data = req.body || {};
    const deviceId = data.device_id;
    const locationId = data.location_id;

    if (!validId(deviceId) || !validId(locationId)) {
      return send(res, 400, { ok: false, error: "Invalid device_id or location_id" });
    }

    const authHeader = req.get("authorization") || "";
    const suppliedToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (suppliedToken.length < 32 || suppliedToken.length > 256) {
      return send(res, 401, { ok: false, error: "Missing or invalid device credential" });
    }

    try {
      // Only the SHA-256 hash is stored in Firestore. The raw token stays on the device.
      const secretDoc = await db.collection("deviceSecrets").doc(deviceId).get();
      if (!secretDoc.exists) {
        return send(res, 401, { ok: false, error: "Device credential is not registered" });
      }
      const suppliedHash = crypto.createHash("sha256").update(suppliedToken).digest("hex");
      if (!safeEqual(suppliedHash, secretDoc.data().tokenHash)) {
        return send(res, 401, { ok: false, error: "Invalid device credential" });
      }

      const rawAdc = data.raw_adc;
      const warningCount = data.warning_count;
      const status = data.status;
      const event = data.event || "observation";
      const firmwareVersion = typeof data.firmware_version === "string"
        ? data.firmware_version.slice(0, 32)
        : "unknown";
      const episodeId = data.episode_id;

      if (!Number.isInteger(rawAdc) || rawAdc < 0 || rawAdc > 1023) {
        return send(res, 400, { ok: false, error: "raw_adc must be an integer from 0 to 1023" });
      }
      if (!Number.isInteger(warningCount) || warningCount < 0 || warningCount > 3) {
        return send(res, 400, { ok: false, error: "warning_count must be an integer from 0 to 3" });
      }
      if (!["NOISE", "NORMAL"].includes(status)) {
        return send(res, 400, { ok: false, error: "status must be NOISE or NORMAL" });
      }
      if (!["observation", "staffroom_alert", "warning_reset"].includes(event)) {
        return send(res, 400, { ok: false, error: "Unsupported event" });
      }
      if (event === "staffroom_alert" &&
          (warningCount !== 3 || !validEpisodeId(episodeId))) {
        return send(res, 400, { ok: false, error: "Staffroom alert requires warning_count 3 and a valid episode_id" });
      }

      // A registered device must be assigned to the exact location it reports.
      const deviceQuery = await db.collection("devices")
        .where("deviceId", "==", deviceId)
        .limit(2)
        .get();
      if (deviceQuery.size !== 1) {
        return send(res, 403, { ok: false, error: "Device is not registered uniquely" });
      }

      const device = deviceQuery.docs[0].data();
      if (device.locationId !== locationId) {
        return send(res, 403, { ok: false, error: "Device is not assigned to this location" });
      }

      const locationDoc = await db.collection("locations").doc(locationId).get();
      if (!locationDoc.exists) {
        return send(res, 404, { ok: false, error: "Location not found" });
      }

      const timestamp = FieldValue.serverTimestamp();
      const observationRef = db.collection("observations").doc();
      const ingestBatch = db.batch();
      ingestBatch.set(observationRef, {
        deviceId,
        locationId,
        timestamp,
        rawValue: rawAdc,
        measurementType: "raw_adc",
        unit: "ADC (0-1023)",
        status,
        warningCount,
        source: "esp8266",
        firmwareVersion,
        createdAt: timestamp
      });
      // A valid authenticated sensor upload is also its server-verified heartbeat.
      // This powers the dashboard's two-minute Online/Offline indicator.
      ingestBatch.update(deviceQuery.docs[0].ref, {
        lastHeartbeatAt: timestamp,
        connectionStatus: "online"
      });
      await ingestBatch.commit();

      let alertCreated = false;
      if (event === "staffroom_alert") {
        const alertId = (deviceId + "_" + episodeId).slice(0, 120);
        const alertRef = db.collection("alerts").doc(alertId);
        await db.runTransaction(async transaction => {
          const existing = await transaction.get(alertRef);
          if (existing.exists) return;
          transaction.create(alertRef, {
            locationId,
            classroomName: locationDoc.data().name || "Unknown classroom",
            deviceId,
            rawAdc,
            warningCount: 3,
            status: "open",
            source: "esp8266",
            episodeId,
            createdAt: FieldValue.serverTimestamp()
          });
          alertCreated = true;
        });
      }

      return send(res, 200, {
        ok: true,
        observation_id: observationRef.id,
        alert_created: alertCreated
      });
    } catch (error) {
      console.error("NoiseMap device ingestion failed:", error);
      return send(res, 500, { ok: false, error: "Could not save device data" });
    }
  }
);
