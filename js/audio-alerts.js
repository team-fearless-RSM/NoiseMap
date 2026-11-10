/**
 * NoiseMap browser audio alerts.
 * Uses consecutive, authenticated ESP8266 raw-ADC observations only.
 * Raw ADC is not calibrated dB/dB(A). The page must remain open to monitor.
 */
const NoiseAudio = (() => {
  const STORAGE_KEY = "noisemap.audioAlerts.enabled";
  const TRACKER_KEY = "noisemap.audioAlerts.breaches";
  const MAX_SAMPLE_GAP_MS = 15000;
  const MAX_READING_AGE_MS = 120000;
  let audioContext = null;
  let soundEnabled = false;
  let onIncident = null;
  let initialized = false;
  const breachTracker = new Map();

  function setStatus(message) {
    const status = document.getElementById("audioMonitorStatus");
    if (status) status.textContent = message;
  }

  function readStoredSetting() {
    try { return window.localStorage.getItem(STORAGE_KEY) === "true"; }
    catch (_) { return false; }
  }

  function saveSetting() {
    try { window.localStorage.setItem(STORAGE_KEY, soundEnabled ? "true" : "false"); }
    catch (_) { /* Storage can be unavailable in private browsing contexts. */ }
  }

  function restoreTracker() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TRACKER_KEY) || "[]");
      if (!Array.isArray(saved)) return;
      saved.forEach(entry => {
        if (Array.isArray(entry) && typeof entry[0] === "string" && entry[1] &&
            Number.isFinite(entry[1].startAt) && Number.isFinite(entry[1].lastTimestamp)) {
          breachTracker.set(entry[0], entry[1]);
        }
      });
    } catch (_) { /* A corrupt or unavailable local cache is safely ignored. */ }
  }

  function saveTracker() {
    try { window.localStorage.setItem(TRACKER_KEY, JSON.stringify(Array.from(breachTracker.entries()))); }
    catch (_) { /* Persistent incident records are still written to Firestore. */ }
  }

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is not supported by this browser.");
    if (!audioContext) audioContext = new AudioContextClass();
    return audioContext;
  }

  async function playChime(force) {
    if (!force && !soundEnabled) return false;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;

    function playNote(frequency, startAt, duration, volume) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    }

    playNote(587.33, now, 0.35, 0.18);
    playNote(880, now + 0.18, 0.52, 0.20);
    return true;
  }

  function readControls() {
    const thresholdInput = document.getElementById("thresholdAdcInput");
    const durationInput = document.getElementById("sustainedSecInput");
    const threshold = thresholdInput ? Number(thresholdInput.value) : 700;
    const duration = durationInput ? Number(durationInput.value) : 5;
    return {
      threshold: Number.isFinite(threshold) ? Math.min(1000, Math.max(200, threshold)) : 700,
      durationSeconds: [3, 5, 10].includes(duration) ? duration : 5
    };
  }

  function evaluateReading(reading) {
    if (!reading || !reading.locationId) return;
    const locationId = String(reading.locationId);
    const timestamp = Number(reading.timestamp);
    const adc = Number(reading.adc);
    const now = Date.now();

    // Do not treat simulated, manually entered, stale or offline data as live sensor input.
    if (reading.source !== "esp8266" || reading.isOnline !== true ||
        !Number.isFinite(timestamp) || now - timestamp > MAX_READING_AGE_MS ||
        timestamp > now + 30000 || !Number.isFinite(adc) || adc < 0 || adc > 1023) {
      breachTracker.delete(locationId);
      saveTracker();
      return;
    }

    const { threshold, durationSeconds } = readControls();
    if (adc < threshold) {
      breachTracker.delete(locationId);
      saveTracker();
      return;
    }

    const previous = breachTracker.get(locationId);
    if (!previous) {
      breachTracker.set(locationId, {
        startAt: timestamp,
        lastTimestamp: timestamp,
        lastReadingId: String(reading.readingId || ""),
        triggered: false
      });
      saveTracker();
      return;
    }

    // Ignore repeated snapshots of the same saved observation.
    if (timestamp <= previous.lastTimestamp) return;

    // A long gap means continuous elevated sound cannot be established.
    if (timestamp - previous.lastTimestamp > MAX_SAMPLE_GAP_MS) {
      breachTracker.set(locationId, {
        startAt: timestamp,
        lastTimestamp: timestamp,
        lastReadingId: String(reading.readingId || ""),
        triggered: false
      });
      saveTracker();
      return;
    }

    previous.lastTimestamp = timestamp;
    previous.lastReadingId = String(reading.readingId || "");
    saveTracker();

    if (previous.triggered || timestamp - previous.startAt < durationSeconds * 1000) return;

    previous.triggered = true;
    saveTracker();
    const incident = {
      incidentId: "audio_" + locationId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) + "_" + Math.floor(previous.startAt / 1000),
      locationId,
      locationName: String(reading.locationName || "Classroom"),
      deviceId: String(reading.deviceId || ""),
      rawAdc: Math.round(adc),
      thresholdAdc: threshold,
      durationSeconds,
      startAt: previous.startAt,
      detectedAt: timestamp
    };

    if (soundEnabled) {
      playChime(false).catch(error => {
        console.warn("NoiseMap audio alert could not play:", error);
        setStatus("Incident detected, but browser audio could not play. Use Test Chime to enable audio.");
      });
    }

    if (typeof onIncident === "function") {
      Promise.resolve(onIncident(incident)).then(result => {
        if (result && result.duplicate) {
          setStatus("Sustained threshold event detected. Matching incident is already recorded.");
        } else {
          setStatus("Sustained threshold event saved to Staffroom Alerts.");
        }
      }).catch(error => {
        console.error("Could not save NoiseMap audio incident:", error);
        previous.triggered = false;
        saveTracker();
        setStatus("Threshold event detected, but it could not be saved. Check team sign-in and Firestore access.");
      });
    }
  }

  function resetAll() {
    breachTracker.clear();
    saveTracker();
  }

  function init(options) {
    if (initialized) return;
    initialized = true;
    onIncident = options && typeof options.onIncident === "function" ? options.onIncident : null;
    soundEnabled = readStoredSetting();
    restoreTracker();

    const toggle = document.getElementById("audioAlertToggle");
    const testButton = document.getElementById("testToneBtn");
    const thresholdInput = document.getElementById("thresholdAdcInput");
    const durationInput = document.getElementById("sustainedSecInput");

    if (toggle) {
      toggle.checked = soundEnabled;
      toggle.addEventListener("change", async () => {
        soundEnabled = toggle.checked;
        saveSetting();
        if (soundEnabled) {
          try {
            const ctx = getAudioContext();
            if (ctx.state === "suspended") await ctx.resume();
            setStatus("Sound enabled. Waiting for sustained live ESP8266 readings.");
          } catch (error) {
            soundEnabled = false;
            toggle.checked = false;
            saveSetting();
            setStatus(error.message || "Browser audio is unavailable.");
          }
        } else {
          setStatus("Sound is off. Threshold incidents can still be recorded while this page is open.");
        }
      });
    }

    if (testButton) {
      testButton.addEventListener("click", async () => {
        testButton.disabled = true;
        try {
          await playChime(true);
          setStatus("Test chime played. This was an audio test, not a noise incident.");
        } catch (error) {
          setStatus(error.message || "Could not play the test chime.");
        } finally {
          testButton.disabled = false;
        }
      });
    }

    const refreshHint = () => {
      const { threshold, durationSeconds } = readControls();
      const soundText = soundEnabled ? "Sound enabled" : "Sound off";
      setStatus(soundText + " · Trigger: " + threshold + " ADC for " + durationSeconds +
        " seconds · requires consecutive live readings no more than 15 seconds apart.");
    };
    if (thresholdInput) thresholdInput.addEventListener("change", refreshHint);
    if (durationInput) durationInput.addEventListener("change", refreshHint);
    refreshHint();
  }

  return { init, evaluateReading, resetAll };
})();
