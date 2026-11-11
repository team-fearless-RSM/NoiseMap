const NM_PROJECT = "noisemap-ead56";

const NM_RECIPIENT =
  "guruprasad.kothavale@iteachschools.org";

const NM_HARDWARE_SOURCE = "arduino_uno_hc05";
const NM_SIMULATOR_SOURCE = "noise_map_simulator";

const NM_MANUAL_TEST_ALERT_ID =
  "WrLs3x0sthG6lR58bciS";

const NM_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbz6ART_ZOU3sx9a15_kmBWs8hN8hielk_KhnpeVxIrHRuVJYO4hYpN8xDS8-in63jcIUQ/exec";

const NM_OBSERVATION_INTERVAL_SECONDS = 10;
const NM_QUIET_PERIOD_MINUTES = 10;
const NM_MAX_READING_GAP_SECONDS = 30;
const NM_MIN_NORMAL_READINGS = 48;

const NM_HEARTBEAT_INTERVAL_SECONDS = 30;
const NM_HEARTBEAT_TIMEOUT_SECONDS = 120;


// ============================================================
// 2. FIRESTORE HELPERS
// ============================================================

function nmBaseUrl() {
  return "https://firestore.googleapis.com/v1/projects/" +
    NM_PROJECT +
    "/databases/(default)/documents";
}

function nmHeaders() {
  return {
    Authorization: "Bearer " + ScriptApp.getOAuthToken()
  };
}

function nmGetString(fields, name, fallback) {
  if (
    fields &&
    fields[name] &&
    fields[name].stringValue !== undefined
  ) {
    return fields[name].stringValue;
  }

  return fallback || "";
}

function nmGetInteger(fields, name, fallback) {
  if (!fields || !fields[name]) return fallback || 0;
  const parsed = Number(fields[name].integerValue);
  return Number.isFinite(parsed) ? parsed : (fallback || 0);
}

function nmGetTimestamp(fields, name) {
  if (
    !fields ||
    !fields[name] ||
    !fields[name].timestampValue
  ) {
    return null;
  }

  const value = new Date(
    fields[name].timestampValue
  ).getTime();

  return isNaN(value) ? null : value;
}

function nmFirestoreWrite(method, url, data) {
  const response = UrlFetchApp.fetch(url, {
    method: method,
    headers: nmHeaders(),
    contentType: "application/json",
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Firestore HTTP " + status + ": " +
      response.getContentText()
    );
  }

  const body = response.getContentText();

  return body ? JSON.parse(body) : {};
}


// ============================================================
// 3. DEVICE SECRET
// ============================================================

function createNoiseMapDeviceSecret() {
  const secret =
    Utilities.getUuid() + Utilities.getUuid();

  PropertiesService
    .getScriptProperties()
    .setProperty("NM_DEVICE_SECRET", secret);

  Logger.log("New NoiseMap device secret generated.");
  Logger.log("Copy it privately for device configuration.");
  Logger.log("Never share it publicly.");
}


// Run only when the bridge computer needs the existing secret value.
// Copy it from the private Apps Script execution log; never share it publicly.
function logNoiseMapDeviceSecretForBridge() {
  const secret = PropertiesService
    .getScriptProperties()
    .getProperty("NM_DEVICE_SECRET");
  if (!secret) {
    throw new Error("NM_DEVICE_SECRET is not configured. Run createNoiseMapDeviceSecret() first.");
  }
  Logger.log("Copy this value into NOISEMAP_DEVICE_SECRET on the bridge computer:");
  Logger.log(secret);
}


// ============================================================
// 4. FIRESTORE DIAGNOSTICS
// ============================================================

function testNoiseMapFirestore() {
  const response = UrlFetchApp.fetch(
    nmBaseUrl() + "/observations?pageSize=5",
    {
      method: "get",
      headers: nmHeaders(),
      muteHttpExceptions: true
    }
  );

  Logger.log(
    "HTTP status: " + response.getResponseCode()
  );

  Logger.log(response.getContentText());
}

function testNoiseMapObservationFields() {
  const response = UrlFetchApp.fetch(
    nmBaseUrl() + "/observations?pageSize=5",
    {
      method: "get",
      headers: nmHeaders(),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() !== 200) {
    Logger.log(response.getContentText());
    return;
  }

  const result = JSON.parse(response.getContentText());

  if (!result.documents || result.documents.length === 0) {
    Logger.log("No observation documents found.");
    return;
  }

  result.documents.forEach(function(doc, index) {
    Logger.log("OBSERVATION " + (index + 1));
    Logger.log(JSON.stringify(doc, null, 2));
  });
}

function diagnoseAllNoiseMapObservations() {
  const documents = nmReadCollection("observations");

  let withFields = 0;
  let withoutFields = 0;
  let realESP = 0;
  let simulated = 0;

  documents.forEach(function(doc) {
    const fields = doc.fields || {};

    if (Object.keys(fields).length > 0) {
      withFields++;
    } else {
      withoutFields++;
    }

    if (
      nmGetString(fields, "source", "") === NM_HARDWARE_SOURCE &&
      (!fields.isSimulated ||
       fields.isSimulated.booleanValue !== true)
    ) {
      realESP++;
    }

    if (
      fields.isSimulated &&
      fields.isSimulated.booleanValue === true
    ) {
      simulated++;
    }
  });

  Logger.log("TOTAL DOCUMENTS: " + documents.length);
  Logger.log("DOCUMENTS WITH FIELDS: " + withFields);
  Logger.log("EMPTY DOCUMENTS: " + withoutFields);
  Logger.log("REAL UNO + HC-05 DOCUMENTS: " + realESP);
  Logger.log("SIMULATED DOCUMENTS: " + simulated);
}


// ============================================================
// 5. EMAIL TEST
// ============================================================

function testNoiseMapEmail() {
  MailApp.sendEmail({
    to: NM_RECIPIENT,
    subject: "NoiseMap - Email Test Successful",
    body:
      "Hello!\n\n" +
      "This is a test email from NoiseMap.\n\n" +
      "Email integration: SUCCESSFUL\n\n" +
      "Team Fearless | NoiseMap"
  });

  Logger.log("Test email sent.");
}


// ============================================================
// 6. MANUAL TEST ALERT EMAIL
// NO ACTION TRACKER ENTRY
// ============================================================

function runNoiseMapManualTest() {
  const url =
    nmBaseUrl() +
    "/alerts/" +
    encodeURIComponent(NM_MANUAL_TEST_ALERT_ID);

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: nmHeaders(),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(
      "Could not read manual test alert: " +
      response.getContentText()
    );
  }

  const alert = JSON.parse(response.getContentText());
  const fields = alert.fields || {};

  if (
    nmGetString(fields, "source", "") !== "manual_test" ||
    nmGetString(fields, "status", "") !== "open" ||
    Number(
      fields.warningCount
        ? fields.warningCount.integerValue
        : 0
    ) < 3
  ) {
    throw new Error(
      "Alert does not meet manual test conditions."
    );
  }

  MailApp.sendEmail({
    to: NM_RECIPIENT,
    subject: "NoiseMap - Manual Alert Test",
    body:
      "This is a manual test alert from NoiseMap.\n\n" +
      "Team Fearless | NoiseMap"
  });

  Logger.log("Manual test alert email sent.");
}


// ============================================================
// 7. READ FIRESTORE COLLECTION
// ============================================================

function nmReadCollection(collectionName) {
  const response = UrlFetchApp.fetch(
    nmBaseUrl() +
    "/" + encodeURIComponent(collectionName) +
    "?pageSize=1000",
    {
      method: "get",
      headers: nmHeaders(),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() !== 200) {
    throw new Error(
      "Could not read collection " +
      collectionName + ": " +
      response.getContentText()
    );
  }

  const result = JSON.parse(response.getContentText());

  return result.documents || [];
}


// ============================================================
// 8. JSON RESPONSE
// ============================================================

function nmJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// 9. MAIN WEB APP RECEIVER
// ============================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Request body is missing.");
    }

    const data = JSON.parse(e.postData.contents);

    const secret = PropertiesService
      .getScriptProperties()
      .getProperty("NM_DEVICE_SECRET");

    if (!secret) {
      throw new Error("NoiseMap device secret is not configured.");
    }

    if (data.api_key !== secret) {
      throw new Error("Unauthorized device.");
    }


    // --------------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------------

    if (data.event === "health_check") {
      return nmJsonResponse({
        ok: true,
        message: "NoiseMap endpoint is working."
      });
    }


    // --------------------------------------------------------
    // DEVICE HEARTBEAT
    // --------------------------------------------------------

    if (data.event === "heartbeat") {
      const deviceId = String(data.device_id || "").trim();
      const locationId = String(data.location_id || "").trim();

      if (!deviceId || !locationId) {
        throw new Error(
          "Heartbeat requires device_id and location_id."
        );
      }

      // Find registered device by its deviceId FIELD.
      // Firestore document ID can be different.
      const queryUrl = nmBaseUrl() + ":runQuery";

      const queryPayload = {
        structuredQuery: {
          from: [
            { collectionId: "devices" }
          ],
          where: {
            fieldFilter: {
              field: { fieldPath: "deviceId" },
              op: "EQUAL",
              value: { stringValue: deviceId }
            }
          },
          limit: 2
        }
      };

      const queryResponse = UrlFetchApp.fetch(
        queryUrl,
        {
          method: "post",
          headers: nmHeaders(),
          contentType: "application/json",
          payload: JSON.stringify(queryPayload),
          muteHttpExceptions: true
        }
      );

      if (queryResponse.getResponseCode() !== 200) {
        throw new Error(
          "Could not search registered devices: " +
          queryResponse.getContentText()
        );
      }

      const queryResults = JSON.parse(
        queryResponse.getContentText()
      );

      const matchingDevices = queryResults
        .filter(function(item) {
          return item && item.document;
        })
        .map(function(item) {
          return item.document;
        });

      if (matchingDevices.length === 0) {
        throw new Error(
          "Device ID is not registered in NoiseMap: " +
          deviceId
        );
      }

      if (matchingDevices.length > 1) {
        throw new Error(
          "More than one device has this deviceId. " +
          "Please make deviceId values unique."
        );
      }

      const registeredDevice = matchingDevices[0];
      const deviceFields = registeredDevice.fields || {};

      // IMPORTANT FIX:
      // runQuery returns a resource name, not a full URL.
      // Build the full Firestore REST URL here.
      const deviceDocumentUrl =
        "https://firestore.googleapis.com/v1/" +
        registeredDevice.name;

      const registeredDeviceId = nmGetString(
        deviceFields,
        "deviceId",
        ""
      );

      if (registeredDeviceId !== deviceId) {
        throw new Error(
          "Registered device ID verification failed."
        );
      }

      const registeredLocationId = nmGetString(
        deviceFields,
        "locationId",
        ""
      );

      if (
        !registeredLocationId ||
        registeredLocationId !== locationId
      ) {
        throw new Error(
          "Heartbeat location does not match the registered device location."
        );
      }

      const connectionStatus = nmGetString(
        deviceFields,
        "connectionStatus",
        ""
      ).toLowerCase();

      if (connectionStatus === "planned") {
        throw new Error(
          "This device is still marked as planned. " +
          "Activate/register it before accepting hardware heartbeats."
        );
      }

      // Verify assigned location exists and is active.
      const locationUrl =
        nmBaseUrl() +
        "/locations/" +
        encodeURIComponent(registeredLocationId);

      const locationResponse = UrlFetchApp.fetch(
        locationUrl,
        {
          method: "get",
          headers: nmHeaders(),
          muteHttpExceptions: true
        }
      );

      if (locationResponse.getResponseCode() !== 200) {
        throw new Error(
          "The device's assigned location was not found in NoiseMap."
        );
      }

      const registeredLocation = JSON.parse(
        locationResponse.getContentText()
      );

      const locationStatus = nmGetString(
        registeredLocation.fields || {},
        "status",
        ""
      ).toLowerCase();

      if (locationStatus !== "active") {
        throw new Error(
          "The device's assigned location is not active."
        );
      }

      const now = new Date().toISOString();

      const heartbeatFields = {
        lastHeartbeatAt: {
          timestampValue: now
        },
        lastHeartbeatSource: {
          stringValue: "apps_script_hc05_bridge"
        },
        lastHeartbeatFirmwareVersion: {
          stringValue: String(
            data.firmware_version || "unknown"
          )
        },
        lastHeartbeatIntervalSeconds: {
          integerValue: String(
            NM_HEARTBEAT_INTERVAL_SECONDS
          )
        }
      };

      const updateUrl =
        deviceDocumentUrl +
        "?updateMask.fieldPaths=lastHeartbeatAt" +
        "&updateMask.fieldPaths=lastHeartbeatSource" +
        "&updateMask.fieldPaths=lastHeartbeatFirmwareVersion" +
        "&updateMask.fieldPaths=lastHeartbeatIntervalSeconds";

      nmFirestoreWrite(
        "patch",
        updateUrl,
        { fields: heartbeatFields }
      );

      return nmJsonResponse({
        ok: true,
        message: "Device heartbeat received.",
        device_id: deviceId,
        firestore_document: deviceDocumentUrl.split("/").pop(),
        location_id: locationId,
        last_heartbeat: now
      });
    }


    // --------------------------------------------------------
    // SEPARATE FIRESTORE TEST COLLECTION
    // --------------------------------------------------------

    if (data.event === "endpoint_test_observation") {
      const deviceId = String(data.device_id || "");
      const locationId = String(data.location_id || "");

      if (!deviceId || !locationId) {
        throw new Error(
          "Test device_id and location_id are required."
        );
      }

      const testId = Utilities.getUuid();
      const now = new Date().toISOString();

      const testFields = {
        deviceId: { stringValue: deviceId },
        locationId: { stringValue: locationId },
        timestamp: { timestampValue: now },
        createdAt: { timestampValue: now },
        rawValue: { integerValue: "123" },
        measurementType: { stringValue: "raw_adc" },
        unit: { stringValue: "ADC (0-1023)" },
        status: { stringValue: "NORMAL" },
        source: {
          stringValue: "apps_script_endpoint_test"
        },
        isSimulated: { booleanValue: true }
      };

      nmFirestoreWrite(
        "patch",
        nmBaseUrl() +
        "/endpoint_test_observations/" +
        testId,
        { fields: testFields }
      );

      return nmJsonResponse({
        ok: true,
        message: "Test observation saved.",
        collection: "endpoint_test_observations",
        document_id: testId,
        simulated: true
      });
    }


    // --------------------------------------------------------
    // NORMAL OBSERVATION
    // --------------------------------------------------------

    if (data.event === "observation" || data.event === "warning_reset") {
      const deviceId = String(data.device_id || "");
      const locationId = String(data.location_id || "");

      const rawAdc = Number(data.raw_adc);

      if (!deviceId || !locationId) {
        throw new Error(
          "Observation requires device_id and location_id."
        );
      }

      if (
        !Number.isFinite(rawAdc) ||
        rawAdc < 0 ||
        rawAdc > 1023
      ) {
        throw new Error(
          "raw_adc must be between 0 and 1023."
        );
      }

      const now = new Date().toISOString();
      const observationId = Utilities.getUuid();

      const status = String(data.status || "NORMAL");
      const warningCount = Number(data.warning_count || 0);

      const observationFields = {
        deviceId: { stringValue: deviceId },
        locationId: { stringValue: locationId },
        timestamp: { timestampValue: now },
        createdAt: { timestampValue: now },
        rawValue: {
          integerValue: String(rawAdc)
        },
        measurementType: {
          stringValue: "raw_adc"
        },
        unit: {
          stringValue: "ADC (0-1023)"
        },
        status: {
          stringValue: status
        },
        warningCount: {
          integerValue: String(warningCount)
        },
        source: {
          stringValue: NM_HARDWARE_SOURCE
        },
        isSimulated: {
          booleanValue: false
        },
        firmwareVersion: {
          stringValue: String(
            data.firmware_version || "unknown"
          )
        }
      };

      nmFirestoreWrite(
        "patch",
        nmBaseUrl() +
        "/observations/" +
        observationId,
        { fields: observationFields }
      );

      return nmJsonResponse({
        ok: true,
        message: data.event === "warning_reset"
          ? "Normal/reset reading received."
          : "Reading received.",
        observation_id: observationId
      });
    }


    // --------------------------------------------------------
    // STAFFROOM ALERT
    // --------------------------------------------------------

    if (data.event === "staffroom_alert") {
      const deviceId = String(data.device_id || "");
      const locationId = String(data.location_id || "");

      if (!deviceId || !locationId) {
        throw new Error(
          "Staffroom alert requires device and location IDs."
        );
      }

      const warningCount = Number(data.warning_count || 0);
      const episodeId = String(data.episode_id || "").trim();

      if (
        warningCount !== 3 ||
        !/^[A-Za-z0-9_-]{6,64}$/.test(episodeId)
      ) {
        throw new Error(
          "Staffroom alert requires warning_count=3 and a valid episode_id."
        );
      }

      // Deterministic ID makes bridge retries idempotent for one noise episode.
      const alertId = deviceId + "_" + episodeId;
      const alertUrl =
        nmBaseUrl() + "/alerts/" + encodeURIComponent(alertId);
      const lock = LockService.getScriptLock();

      if (!lock.tryLock(10000)) {
        throw new Error("Could not acquire alert-save lock. Retry the event.");
      }

      try {
        const existingResponse = UrlFetchApp.fetch(alertUrl, {
          method: "get",
          headers: nmHeaders(),
          muteHttpExceptions: true
        });

        if (existingResponse.getResponseCode() === 200) {
          return nmJsonResponse({
            ok: true,
            message: "Staffroom alert was already saved.",
            alert_id: alertId,
            duplicate: true
          });
        }

        if (existingResponse.getResponseCode() !== 404) {
          throw new Error(
            "Could not check existing alert: " +
            existingResponse.getContentText()
          );
        }

        const now = new Date().toISOString();
        const alertFields = {
          deviceId: { stringValue: deviceId },
          locationId: { stringValue: locationId },
          source: { stringValue: NM_HARDWARE_SOURCE },
          status: { stringValue: "open" },
          createdAt: { timestampValue: now },
          timestamp: { timestampValue: now },
          warningCount: { integerValue: "3" },
          episodeId: { stringValue: episodeId },
          isSimulated: { booleanValue: false },
          message: {
            stringValue: String(
              data.message || "Noise threshold exceeded."
            )
          }
        };

        nmFirestoreWrite(
          "patch",
          alertUrl,
          { fields: alertFields }
        );

        return nmJsonResponse({
          ok: true,
          message: "Staffroom alert saved.",
          alert_id: alertId,
          duplicate: false
        });
      } finally {
        lock.releaseLock();
      }
    }


    throw new Error(
      "Unknown event type: " + String(data.event)
    );

  } catch (error) {
    console.error(
      "NoiseMap receiver error: " + error.message
    );

    return nmJsonResponse({
      ok: false,
      error: error.message
    });
  }
}


// ============================================================
// 10. TEST WEB APP HEALTH
// ============================================================

function testNoiseMapWebApp() {
  const secret = PropertiesService
    .getScriptProperties()
    .getProperty("NM_DEVICE_SECRET");

  if (!secret) {
    throw new Error("Device secret is missing.");
  }

  const response = UrlFetchApp.fetch(
    NM_WEB_APP_URL,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        api_key: secret,
        event: "health_check"
      }),
      muteHttpExceptions: true
    }
  );

  Logger.log(
    "HTTP: " + response.getResponseCode()
  );

  Logger.log(response.getContentText());
}


// ============================================================
// 11. TEST SEPARATE FIRESTORE COLLECTION WRITE
// ============================================================

function testNoiseMapEndpointWrite() {
  const secret = PropertiesService
    .getScriptProperties()
    .getProperty("NM_DEVICE_SECRET");

  if (!secret) {
    throw new Error("Device secret is missing.");
  }

  const payload = {
    api_key: secret,
    event: "endpoint_test_observation",
    device_id: "NOISEMAP_TEST_DEVICE",
    location_id: "NOISEMAP_TEST_LOCATION"
  };

  const response = UrlFetchApp.fetch(
    NM_WEB_APP_URL,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  Logger.log(
    "HTTP: " + response.getResponseCode()
  );

  Logger.log(response.getContentText());
}


// ============================================================
// 12. HEARTBEAT TEST
// ============================================================

function testNoiseMapHeartbeat() {
  const secret = PropertiesService
    .getScriptProperties()
    .getProperty("NM_DEVICE_SECRET");

  if (!secret) {
    throw new Error("Device secret is missing.");
  }

  const payload = {
    api_key: secret,
    event: "heartbeat",
    device_id: "NM-TEST-02",
    location_id: "0i9ooc76D88nsqzsX6YU",
    firmware_version: "backend-only-test"
  };

  const response = UrlFetchApp.fetch(
    NM_WEB_APP_URL,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  Logger.log(
    "HTTP: " + response.getResponseCode()
  );

  Logger.log(response.getContentText());
}


// ============================================================
// 13. ALERT QUIET-PERIOD CHECK
// ============================================================

function nmCheckQuietPeriod(
  alertFields,
  observations,
  now
) {
  const alertCreated = nmGetTimestamp(
    alertFields,
    "createdAt"
  );

  if (alertCreated === null) {
    return {
      resolved: false,
      reason: "Alert creation time is missing."
    };
  }

  const deviceId = nmGetString(
    alertFields,
    "deviceId",
    ""
  );

  const readings = observations
    .filter(function(doc) {
      const fields = doc.fields || {};

      return (
        nmGetString(fields, "source", "") === NM_HARDWARE_SOURCE &&
        nmGetString(fields, "deviceId", "") === deviceId &&
        (!fields.isSimulated ||
          fields.isSimulated.booleanValue !== true) &&
        nmGetTimestamp(fields, "timestamp") !== null
      );
    })
    .map(function(doc) {
      const fields = doc.fields || {};

      return {
        timestamp: nmGetTimestamp(
          fields,
          "timestamp"
        ),
        status: nmGetString(
          fields,
          "status",
          ""
        )
      };
    })
    .filter(function(reading) {
      return (
        reading.timestamp >= alertCreated &&
        reading.timestamp <= now
      );
    })
    .sort(function(a, b) {
      return a.timestamp - b.timestamp;
    });

  if (readings.length === 0) {
    return {
      resolved: false,
      reason: "No real readings after alert creation."
    };
  }

  const latest = readings[readings.length - 1];

  if (
    now - latest.timestamp >
    NM_MAX_READING_GAP_SECONDS * 1000
  ) {
    return {
      resolved: false,
      reason: "Latest reading is stale."
    };
  }

  if (latest.status !== "NORMAL") {
    return {
      resolved: false,
      reason: "Latest reading is not NORMAL."
    };
  }

  let quietStart = null;
  let previousTime = null;
  let normalCount = 0;

  readings.forEach(function(reading) {
    if (reading.status !== "NORMAL") {
      quietStart = null;
      previousTime = null;
      normalCount = 0;
      return;
    }

    if (
      previousTime !== null &&
      reading.timestamp - previousTime >
        NM_MAX_READING_GAP_SECONDS * 1000
    ) {
      quietStart = null;
      normalCount = 0;
    }

    if (quietStart === null) {
      quietStart = reading.timestamp;
      normalCount = 0;
    }

    normalCount++;
    previousTime = reading.timestamp;
  });

  if (
    quietStart === null ||
    previousTime === null
  ) {
    return {
      resolved: false,
      reason: "No continuous normal-reading sequence."
    };
  }

  const quietDuration = previousTime - quietStart;

  if (
    quietDuration >=
      NM_QUIET_PERIOD_MINUTES * 60 * 1000 &&
    normalCount >= NM_MIN_NORMAL_READINGS
  ) {
    return {
      resolved: true,
      reason:
        "10 minutes of continuous normal readings.",
      normalCount: normalCount,
      quietDurationMinutes:
        quietDuration / 60000
    };
  }

  return {
    resolved: false,
    reason:
      "Quiet period or reading count insufficient.",
    normalCount: normalCount
  };
}


// ============================================================
// 14. ALERT EMAIL
// ============================================================

function nmSendAlertEmail(
  alertId,
  fields,
  properties
) {
  const sentKey = "NM_EMAIL_SENT_" + alertId;

  if (properties.getProperty(sentKey) === "yes") {
    return false;
  }

  const locationId = nmGetString(
    fields,
    "locationId",
    "Unknown"
  );

  const deviceId = nmGetString(
    fields,
    "deviceId",
    "Unknown"
  );

  const warningCount = nmGetInteger(
    fields,
    "warningCount",
    0
  );

  const message = nmGetString(
    fields,
    "message",
    "Noise threshold exceeded."
  );

  MailApp.sendEmail({
    to: NM_RECIPIENT,
    subject: "NoiseMap - Noise Alert",
    body:
      "NoiseMap has recorded a noise alert.\n\n" +
      "Location ID: " + locationId + "\n" +
      "Device ID: " + deviceId + "\n" +
      "Warning count: " + warningCount + "\n" +
      "Message: " + message + "\n\n" +
      "Alert ID: " + alertId + "\n\n" +
      "Team Fearless | NoiseMap"
  });

  properties.setProperty(sentKey, "yes");

  Logger.log("Alert email sent: " + alertId);

  return true;
}


// ============================================================
// 15. RESOLVE FIRESTORE ALERT
// ============================================================

function nmResolveFirestoreAlert(
  alertId,
  reason
) {
  const now = new Date().toISOString();

  const url =
    nmBaseUrl() +
    "/alerts/" +
    encodeURIComponent(alertId) +
    "?updateMask.fieldPaths=status" +
    "&updateMask.fieldPaths=resolvedAt" +
    "&updateMask.fieldPaths=resolutionReason";

  const fields = {
    status: {
      stringValue: "resolved"
    },
    resolvedAt: {
      timestampValue: now
    },
    resolutionReason: {
      stringValue: reason
    }
  };

  nmFirestoreWrite(
    "patch",
    url,
    { fields: fields }
  );

  Logger.log(
    "Alert automatically resolved: " + alertId
  );
}


// ============================================================
// 16. LIVE ALERT MONITORING
// EMAIL + AUTOMATIC RESOLUTION
// NO ACTION TRACKER ENTRY
// ============================================================

function pollNoiseMapAlerts() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    Logger.log(
      "Another monitoring run is active."
    );
    return;
  }

  try {
    const properties =
      PropertiesService.getScriptProperties();

    const alerts = nmReadCollection("alerts");
    const observations =
      nmReadCollection("observations");

    let emails = 0;
    let resolved = 0;

    alerts.forEach(function(alert) {
      const fields = alert.fields || {};

      if (
        nmGetString(fields, "source", "") !== NM_HARDWARE_SOURCE ||
        (fields.isSimulated && fields.isSimulated.booleanValue === true) ||
        nmGetString(fields, "status", "") !== "open" ||
        Number(
          fields.warningCount
            ? fields.warningCount.integerValue
            : 0
        ) < 3
      ) {
        return;
      }

      const alertId =
        alert.name.split("/").pop();

      try {
        const sentKey =
          "NM_EMAIL_SENT_" + alertId;

        if (
          properties.getProperty(sentKey) !== "yes"
        ) {
          nmSendAlertEmail(
            alertId,
            fields,
            properties
          );

          emails++;
        }

        const result = nmCheckQuietPeriod(
          fields,
          observations,
          Date.now()
        );

        if (result.resolved) {
          nmResolveFirestoreAlert(
            alertId,
            result.reason
          );

          resolved++;
        } else {
          Logger.log(
            "Alert remains open: " +
            alertId +
            " | " +
            result.reason
          );
        }

      } catch (error) {
        Logger.log(
          "Alert processing error " +
          alertId +
          ": " +
          error.message
        );
      }
    });

    Logger.log("Monitoring completed.");
    Logger.log("New alert emails sent: " + emails);
    Logger.log("Alerts resolved: " + resolved);
    Logger.log(
      "Automatic Action Tracker creation: DISABLED."
    );

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// 17. FIVE-MINUTE MONITORING TRIGGER
// RUN ONLY IF THE EXISTING TRIGGER IS MISSING
// ============================================================

function installNoiseMapFiveMinuteTrigger() {
  const handler = "pollNoiseMapAlerts";

  ScriptApp.getProjectTriggers().forEach(
    function(trigger) {
      if (
        trigger.getHandlerFunction() === handler
      ) {
        ScriptApp.deleteTrigger(trigger);
      }
    }
  );

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log(
    "NoiseMap five-minute trigger installed."
  );
}


// ============================================================
// 18. SIMULATOR HELPERS
// ============================================================

function nmSimulatorWriteObservation(
  deviceId,
  locationId,
  status,
  timestamp
) {
  const observationId = Utilities.getUuid();

  const fields = {
    deviceId: { stringValue: deviceId },
    locationId: { stringValue: locationId },
    timestamp: {
      timestampValue: new Date(timestamp).toISOString()
    },
    createdAt: {
      timestampValue: new Date(timestamp).toISOString()
    },
    rawValue: {
      integerValue: status === "NORMAL" ? "100" : "800"
    },
    measurementType: {
      stringValue: "raw_adc"
    },
    unit: {
      stringValue: "ADC (0-1023)"
    },
    status: {
      stringValue: status
    },
    warningCount: {
      integerValue: status === "NORMAL" ? "0" : "3"
    },
    source: {
      stringValue: NM_SIMULATOR_SOURCE
    },
    isSimulated: {
      booleanValue: true
    },
    firmwareVersion: {
      stringValue: "noise-map-simulator"
    }
  };

  nmFirestoreWrite(
    "patch",
    nmBaseUrl() +
    "/observations/" +
    observationId,
    { fields: fields }
  );

  return observationId;
}

function nmSimulatorCreateAlert(
  deviceId,
  locationId,
  timestamp
) {
  const alertId = Utilities.getUuid();

  const fields = {
    deviceId: { stringValue: deviceId },
    locationId: { stringValue: locationId },
    source: { stringValue: NM_SIMULATOR_SOURCE },
    status: { stringValue: "open" },
    createdAt: {
      timestampValue: new Date(timestamp).toISOString()
    },
    timestamp: {
      timestampValue: new Date(timestamp).toISOString()
    },
    warningCount: {
      integerValue: "3"
    },
    message: {
      stringValue: "SIMULATED TEST ALERT - NOT A REAL NOISE EVENT"
    },
    isSimulated: {
      booleanValue: true
    }
  };

  nmFirestoreWrite(
    "patch",
    nmBaseUrl() +
    "/alerts/" +
    alertId,
    { fields: fields }
  );

  return alertId;
}


// ============================================================
// 19. SIMULATOR TESTS
// ============================================================

function testNoiseMapSimulator() {
  const deviceId = "NM-SIM-01";
  const locationId = "gMTrMgyC4AFPIxW0Qv";

  const now = Date.now();

  Logger.log("Starting NoiseMap simulator test.");

  // Test 1: create alert
  const alertId = nmSimulatorCreateAlert(
    deviceId,
    locationId,
    now - 11 * 60 * 1000
  );

  Logger.log("Test alert created: " + alertId);

  // Test 2: generate normal readings
  for (let i = 0; i < 60; i++) {
    nmSimulatorWriteObservation(
      deviceId,
      locationId,
      "NORMAL",
      now - (60 - i) * 10000
    );
  }

  Logger.log("60 simulated normal readings created.");

  // Test 3: run quiet-period logic
  const alertResponse = UrlFetchApp.fetch(
    nmBaseUrl() + "/alerts/" + alertId,
    {
      method: "get",
      headers: nmHeaders(),
      muteHttpExceptions: true
    }
  );

  if (alertResponse.getResponseCode() !== 200) {
    throw new Error("Could not read simulator alert.");
  }

  const alert = JSON.parse(
    alertResponse.getContentText()
  );

  const observations =
    nmReadCollection("observations");

  const result = nmCheckQuietPeriod(
    alert.fields || {},
    observations,
    Date.now()
  );

  Logger.log(
    "Quiet-period test result: " +
    JSON.stringify(result)
  );

  Logger.log("Simulator test completed.");
}


// ============================================================
// 20. SIMULATOR CLEANUP / DIAGNOSTIC
// ============================================================

function diagnoseNoiseMapSimulatorData() {
  const observations =
    nmReadCollection("observations");

  const alerts =
    nmReadCollection("alerts");

  const simulatedObservations =
    observations.filter(function(doc) {
      const fields = doc.fields || {};

      return (
        fields.isSimulated &&
        fields.isSimulated.booleanValue === true
      );
    });

  const simulatedAlerts =
    alerts.filter(function(doc) {
      const fields = doc.fields || {};

      return (
        fields.isSimulated &&
        fields.isSimulated.booleanValue === true
      );
    });

  Logger.log(
    "Total observations: " + observations.length
  );

  Logger.log(
    "Simulated observations: " +
    simulatedObservations.length
  );

  Logger.log(
    "Total alerts: " + alerts.length
  );

  Logger.log(
    "Simulated alerts: " +
    simulatedAlerts.length
  );
}