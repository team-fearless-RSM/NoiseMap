/**
 * NoiseMap CSV export.
 * Exports the current Historical Data observation cache; the app currently
 * subscribes to the latest 300 observations. No extra Firestore query is made.
 */
(function () {
  "use strict";

  function asDate(value) {
    if (!value) return null;
    const date = typeof value.toDate === "function"
      ? value.toDate()
      : (value instanceof Date ? value : new Date(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function csvCell(value) {
    if (value === null || value === undefined) value = "";
    let text = String(value);
    // Prevent spreadsheet formula execution for text imported into Excel/Sheets.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function buildCsv(records, devices, locations) {
    const deviceById = new Map(devices.map(device => [device.id, device]));
    const locationById = new Map(locations.map(location => [location.id, location]));
    const headers = [
      "Timestamp (IST)", "Location ID", "Location Name", "Sensor ID",
      "Raw ADC", "Measurement Type", "Unit", "Source", "Simulated", "Recorded Status"
    ];
    const rows = records.map(record => {
      const device = deviceById.get(record.deviceId);
      const locationId = record.locationId || (device && device.locationId) || "";
      const location = locationById.get(locationId);
      const date = asDate(record.timestamp || record.createdAt);
      const timestamp = date
        ? new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit",
            year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: true
          }).format(date)
        : "Unknown";
      const raw = record.rawValue ?? record.rawAdc ?? record.raw_adc ?? "";
      return [
        timestamp,
        locationId,
        location ? location.name : "Unassigned",
        device ? (device.deviceId || device.id) : (record.deviceId || "Unlinked"),
        raw,
        record.measurementType || "raw_adc",
        record.unit || "ADC (0-1023)",
        record.source || "unknown",
        record.isSimulated === true || record.source === "browser_simulator" ? "Yes" : "No",
        record.status || "Not recorded"
      ].map(csvCell).join(",");
    });
    return "\uFEFF" + [headers.map(csvCell).join(","), ...rows].join("\r\n");
  }

  function download(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportDataset(records, devices, locations, selectedLocation, rangeValue) {
    const button = document.getElementById("exportHistoryCsvBtn");
    const status = document.getElementById("exportStatus");
    const setStatus = message => { if (status) status.textContent = message; };
    if (button) button.disabled = true;
    try {
      const now = Date.now();
      const days = rangeValue === "all" ? null : Number(rangeValue || 7);
      const cutoff = days === null ? 0 : now - days * 24 * 60 * 60 * 1000;
      const deviceById = new Map(devices.map(device => [device.id, device]));
      const filtered = records.filter(record => {
        const device = deviceById.get(record.deviceId);
        const locationId = record.locationId || (device && device.locationId) || "";
        if (selectedLocation && selectedLocation !== "all" && locationId !== selectedLocation) return false;
        if (cutoff) {
          const date = asDate(record.timestamp || record.createdAt);
          if (!date || date.getTime() < cutoff || date.getTime() > now) return false;
        }
        return true;
      }).sort((a, b) => {
        const aDate = asDate(a.timestamp || a.createdAt);
        const bDate = asDate(b.timestamp || b.createdAt);
        return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
      });

      if (!filtered.length) {
        setStatus("No loaded records match these filters.");
        return;
      }
      const csv = buildCsv(filtered, devices, locations);
      const safeLocation = selectedLocation && selectedLocation !== "all"
        ? selectedLocation.replace(/[^A-Za-z0-9_-]/g, "_")
        : "all_locations";
      const dateStamp = new Date().toISOString().slice(0, 10);
      download(csv, "NoiseMap_Historical_Data_" + safeLocation + "_" + dateStamp + ".csv");
      setStatus("Exported " + filtered.length + " of " + records.length + " loaded records.");
    } catch (error) {
      console.error("NoiseMap CSV export failed:", error);
      setStatus("Export failed. Check the browser console.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  window.NoiseExporter = { exportDataset };
})();
