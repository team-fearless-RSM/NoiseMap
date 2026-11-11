const FIREBASE_PROJECT_ID = "noisemap-ead56";
const FIRESTORE_BASE =
  "https://firestore.googleapis.com/v1/projects/" +
  FIREBASE_PROJECT_ID + "/databases/(default)/documents";
const ALERT_EMAIL_TO = "guruprasad.kothavale@iteachschools.org";
const SOURCE = "arduino_uno_hc05";

function doGet() {
  return jsonOutput({ ok: true, service: "NoiseMap Apps Script bridge" });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput({ ok: false, error: "POST JSON body required" }, 400);
    }
    const data = JSON.parse(e.postData.contents);
    const expectedToken = PropertiesService.getScriptProperties()
      .getProperty("NOISEMAP_WEBHOOK_TOKEN");
    if (!expectedToken || !constantTimeEqual(String(data.webhook_token || ""), expectedToken)) {
      return jsonOutput({ ok: false, error: "Unauthorised bridge request" }, 401);
    }

    validatePayload(data);
    const device = findRegisteredDevice(data.device_id);
    if (device.locationId !== data.location_id) {
      throw new Error("Device is not assigned to the reported location");
    }
    const location = getCachedLocation(data.location_id);
    if (!location) throw new Error("Registered location was not found");

    const now = new Date();
    const observationId = Utilities.getUuid().replace(/-/g, "");
    createDocument("observations", observationId, {
      deviceId: stringValue(data.device_id),
      locationId: stringValue(data.location_id),
      timestamp: timestampValue(now),
      rawValue: integerValue(data.raw_adc),
      measurementType: stringValue("raw_adc"),
      unit: stringValue("ADC (0-1023)"),
      thresholdAdc: integerValue(data.threshold_adc),
      status: stringValue(data.status),
      warningCount: integerValue(data.warning_count),
      source: stringValue(SOURCE),
      firmwareVersion: stringValue(data.firmware_version),
      createdAt: timestampValue(now)
    });

    updateHeartbeatIfDue(device.documentId, data.device_id, now);

    let emailStatus = "not_applicable";
    if (data.event === "staffroom_alert") {
      emailStatus = sendIncidentEmail(data, readString(location.fields, "name") || "Unknown classroom", now);
    }

    return jsonOutput({
      ok: true,
      observation_id: observationId,
      event: data.event,
      email_status: emailStatus
    });
  } catch (error) {
    console.error("NoiseMap bridge error: " + error.stack);
    return jsonOutput({ ok: false, error: String(error.message || error) }, 500);
  }
}

function validatePayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("JSON object required");
  }
  ["device_id", "location_id"].forEach(function(key) {
    if (typeof data[key] !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(data[key])) {
      throw new Error("Invalid " + key);
    }
  });
  if (!Number.isInteger(data.raw_adc) || data.raw_adc < 0 || data.raw_adc > 1023) {
    throw new Error("raw_adc must be an integer from 0 to 1023");
  }
  if (!Number.isInteger(data.threshold_adc) || data.threshold_adc < 0 || data.threshold_adc > 1023) {
    throw new Error("threshold_adc must be an integer from 0 to 1023");
  }
  if (!Number.isInteger(data.warning_count) || data.warning_count < 0 || data.warning_count > 3) {
    throw new Error("warning_count must be an integer from 0 to 3");
  }
  if (!["NOISE", "NORMAL"].includes(data.status)) {
    throw new Error("status must be NOISE or NORMAL");
  }
  if (!["observation", "staffroom_alert", "warning_reset"].includes(data.event)) {
    throw new Error("Unsupported event");
  }
  if (data.event === "staffroom_alert" &&
      (data.warning_count !== 3 ||
       typeof data.episode_id !== "string" ||
       !/^[A-Za-z0-9_-]{6,64}$/.test(data.episode_id))) {
    throw new Error("Staffroom alert requires warning_count 3 and a valid episode_id");
  }
}

function findRegisteredDevice(deviceId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "device_" + deviceId;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const queryUrl = FIRESTORE_BASE + ":runQuery";
  const query = {
    structuredQuery: {
      from: [{ collectionId: "devices" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "deviceId" },
          op: "EQUAL",
          value: stringValue(deviceId)
        }
      },
      limit: 2
    }
  };
  const result = firestoreRequest("post", queryUrl, query);
  const documents = (result || []).filter(function(row) { return !!row.document; });
  if (documents.length !== 1) {
    throw new Error("Expected exactly one registered device; found " + documents.length);
  }
  const doc = documents[0].document;
  const device = {
    documentId: doc.name.split("/").pop(),
    locationId: readString(doc.fields, "locationId")
  };
  if (!device.locationId) throw new Error("Registered device has no location assignment");
  cache.put(cacheKey, JSON.stringify(device), 21600);
  return device;
}

function getCachedLocation(locationId) {
  const cache = CacheService.getScriptCache();
  const key = "location_" + locationId;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const location = getDocument("locations", locationId);
  if (location) cache.put(key, JSON.stringify(location), 21600);
  return location;
}

function getDocument(collection, documentId) {
  const url = FIRESTORE_BASE + "/" + collection + "/" + encodeURIComponent(documentId);
  try {
    return firestoreRequest("get", url, null);
  } catch (error) {
    if (String(error.message).indexOf("HTTP 404") >= 0) return null;
    throw error;
  }
}

function createDocument(collection, documentId, fields) {
  const url = FIRESTORE_BASE + "/" + collection +
    "?documentId=" + encodeURIComponent(documentId);
  return firestoreRequest("post", url, { fields: fields });
}

function patchDocument(collection, documentId, fields) {
  const fieldNames = Object.keys(fields);
  const masks = fieldNames.map(function(name) {
    return "updateMask.fieldPaths=" + encodeURIComponent(name);
  }).join("&");
  const url = FIRESTORE_BASE + "/" + collection + "/" +
    encodeURIComponent(documentId) + "?" + masks;
  return firestoreRequest("patch", url, { fields: fields });
}

function firestoreRequest(method, url, body) {
  const options = {
    method: method,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (body !== null) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Firestore API HTTP " + status + ": " + text.slice(0, 400));
  }
  return text ? JSON.parse(text) : {};
}

function updateHeartbeatIfDue(deviceDocumentId, deviceId, now) {
  const props = PropertiesService.getScriptProperties();
  const key = "heartbeat_" + deviceId;
  const last = Number(props.getProperty(key) || 0);
  if (now.getTime() - last < 60000) return;

  patchDocument("devices", deviceDocumentId, {
    lastHeartbeatAt: timestampValue(now),
    connectionStatus: stringValue("online")
  });
  props.setProperty(key, String(now.getTime()));
}

function sendIncidentEmail(data, classroomName, now) {
  const alertId = data.device_id + "_" + data.episode_id;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const existing = getDocument("alerts", alertId);
    if (!existing) {
      createDocument("alerts", alertId, {
        locationId: stringValue(data.location_id),
        classroomName: stringValue(classroomName),
        deviceId: stringValue(data.device_id),
        rawAdc: integerValue(data.raw_adc),
        thresholdAdc: integerValue(data.threshold_adc),
        warningCount: integerValue(3),
        status: stringValue("open"),
        source: stringValue(SOURCE),
        episodeId: stringValue(data.episode_id),
        createdAt: timestampValue(now),
        emailStatus: stringValue("pending")
      });
    }

    const current = getDocument("alerts", alertId);
    const currentStatus = readString(current && current.fields, "emailStatus");
    const sentKey = "sent_" + alertId;
    const props = PropertiesService.getScriptProperties();
    if (currentStatus === "sent") return "sent";
    if (props.getProperty(sentKey) === "yes") {
      patchDocument("alerts", alertId, {
        emailStatus: stringValue("sent"),
        emailTo: stringValue(ALERT_EMAIL_TO),
        emailSentAt: timestampValue(new Date())
      });
      props.deleteProperty(sentKey);
      return "sent";
    }

    const timeText = Utilities.formatDate(now, "Asia/Kolkata", "dd MMM yyyy, hh:mm:ss a");
    const subject = "NoiseMap alert: " + classroomName + " crossed its noise threshold";
    const body = [
      "NoiseMap automatic staffroom alert",
      "Room: " + classroomName,
      "Sensor: " + data.device_id,
      "Raw ADC reading: " + data.raw_adc,
      "Configured threshold: " + data.threshold_adc + " ADC",
      "Warnings: 3 of 3",
      "Time (IST): " + timeText,
      "Incident: " + data.episode_id,
      "",
      "This is a prototype raw-ADC threshold alert, not a calibrated dB(A) measurement."
    ].join("\n");
    const htmlBody =
      "<h2>NoiseMap automatic staffroom alert</h2>" +
      "<p><b>Room:</b> " + escapeHtml(classroomName) + "</p>" +
      "<p><b>Sensor:</b> " + escapeHtml(data.device_id) + "</p>" +
      "<p><b>Raw ADC reading:</b> " + data.raw_adc + "</p>" +
      "<p><b>Configured threshold:</b> " + data.threshold_adc + " ADC</p>" +
      "<p><b>Warnings:</b> 3 of 3</p>" +
      "<p><b>Time (IST):</b> " + escapeHtml(timeText) + "</p>" +
      "<p><b>Incident:</b> " + escapeHtml(data.episode_id) + "</p>" +
      "<p>This is a prototype raw-ADC threshold alert, not a calibrated dB(A) measurement.</p>";

    MailApp.sendEmail({
      to: ALERT_EMAIL_TO,
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      name: "NoiseMap Alerts"
    });
    // Persist the send marker before updating Firestore so a retry cannot send twice.
    props.setProperty(sentKey, "yes");
    patchDocument("alerts", alertId, {
      emailStatus: stringValue("sent"),
      emailTo: stringValue(ALERT_EMAIL_TO),
      emailSentAt: timestampValue(new Date())
    });
    props.deleteProperty(sentKey);
    return "sent";
  } catch (error) {
    try {
      patchDocument("alerts", alertId, {
        emailStatus: stringValue("failed"),
        emailError: stringValue(String(error.message || error).slice(0, 400)),
        emailAttemptedAt: timestampValue(new Date())
      });
    } catch (ignored) {}
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function readString(fields, key) {
  return fields && fields[key] && fields[key].stringValue
    ? fields[key].stringValue : "";
}

function stringValue(value) {
  return { stringValue: String(value) };
}

function integerValue(value) {
  return { integerValue: String(value) };
}

function timestampValue(value) {
  return { timestampValue: value.toISOString() };
}


function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function jsonOutput(value, statusCode) {
  // Apps Script ContentService does not expose a custom HTTP status setter.
  // The body carries the authoritative ok/error result for the bridge.
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
