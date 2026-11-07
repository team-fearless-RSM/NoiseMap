// NoiseMap UI and Firebase email/password authentication.
// The overview contains no hardcoded sample records or readings.
(function () {
  const authScreen = document.getElementById("authScreen");
  const appShell = document.getElementById("appShell");
  const loginForm = document.getElementById("loginForm");
  const loginButton = document.getElementById("loginButton");
  const authMessage = document.getElementById("authMessage");
  const signOutButton = document.getElementById("signOutButton");
  const signedInEmail = document.getElementById("signedInEmail");
  const visitorStatCard = document.getElementById("visitorStatCard");
  const visitorCount = document.getElementById("visitorCount");
  const visitorCountStatus = document.getElementById("visitorCountStatus");
  const visitorAnalytics = document.getElementById("visitorAnalytics");
  let visitorCountUnsubscribe = null;
  let visitorAnalyticsUnsubscribe = null;

  const teamSignInButton = document.getElementById("teamSignInButton");
  const publicViewButton = document.getElementById("publicViewButton");
  const locationList = document.getElementById("firestoreLocationList");
  const locationEmpty = document.getElementById("locationEmpty");
  const locationStatus = document.getElementById("locationStatus");
  const locationForm = document.getElementById("locationForm");
  const locationFormMessage = document.getElementById("locationFormMessage");
  const locationSubmit = document.getElementById("locationSubmit");
  const alertList = document.getElementById("staffroomAlertList");
  const alertsEmpty = document.getElementById("alertsEmpty");
  const alertStatusLine = document.getElementById("alertConnectionStatus");
  const alertTestForm = document.getElementById("alertTestForm");
  const alertLocationSelect = document.getElementById("alertLocation");
  const alertTestSubmit = document.getElementById("alertTestSubmit");
  const alertTestMessage = document.getElementById("alertTestMessage");
  let cachedLocations = [];
  let alertUnsubscribe = null;
  let currentUser = null;
  let canEditAlerts = false;
  let canEditLocations = false;
  let canManageRecords = false;
  let cachedDevices = [];
  let cachedObservations = [];
  let cachedActions = [];
  let deviceUnsubscribe = null;
  let observationUnsubscribe = null;
  let actionUnsubscribe = null;
  let cachedAlerts = [];
  let locationUnsubscribe = null;

  function connectVisitorCounter() {
    if (!window.NoiseMap || !window.NoiseMap.configured) return;
    // Record each page load, including public visits. Public visitors never read the total.
    window.NoiseMap.incrementVisitorCount().catch(error => {
      console.error("Could not record website visit:", error);
    });
  }

  function setVisitorCounterVisibility(isEditor) {
    if (visitorStatCard) visitorStatCard.hidden = !isEditor;
    if (visitorAnalytics) visitorAnalytics.hidden = !isEditor;
    if (visitorCountUnsubscribe) {
      visitorCountUnsubscribe();
      visitorCountUnsubscribe = null;
    }
    if (visitorAnalyticsUnsubscribe) {
      visitorAnalyticsUnsubscribe();
      visitorAnalyticsUnsubscribe = null;
    }
    if (!isEditor || !window.NoiseMap || !window.NoiseMap.configured || !visitorCount) return;
    if (visitorCountStatus) visitorCountStatus.textContent = "Loading visit count…";
    visitorCountUnsubscribe = window.NoiseMap.subscribeVisitorCount(count => {
      visitorCount.textContent = Number(count).toLocaleString("en-IN");
      if (visitorCountStatus) visitorCountStatus.textContent = "All recorded website visits";
    }, error => {
      console.error("Could not load visitor count:", error);
      if (visitorCountStatus) visitorCountStatus.textContent = "Visit count unavailable";
    });
    const analyticsStatus = document.getElementById("visitorAnalyticsStatus");
    visitorAnalyticsUnsubscribe = window.NoiseMap.subscribeVisitorAnalytics(dailyCounts => {
      renderVisitorAnalytics(dailyCounts);
      if (analyticsStatus) analyticsStatus.textContent = "Live Firestore analytics · Daily totals recorded from the date analytics was enabled.";
    }, error => {
      console.error("Could not load visitor analytics:", error);
      if (analyticsStatus) analyticsStatus.textContent = "Analytics unavailable. Check Firestore rules and connection.";
    });
  }

  function indiaDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date).reduce((result, item) => {
      if (item.type !== "literal") result[item.type] = item.value;
      return result;
    }, {});
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function shiftDateKey(key, offset) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    return date.toISOString().slice(0, 10);
  }

  function renderVisitorAnalytics(dailyCounts) {
    const todayKey = indiaDateKey();
    const today = Number(dailyCounts[todayKey] || 0);
    const lastSevenKeys = Array.from({ length: 7 }, (_, index) => shiftDateKey(todayKey, index - 6));
    const week = lastSevenKeys.reduce((sum, key) => sum + Number(dailyCounts[key] || 0), 0);
    const monthPrefix = todayKey.slice(0, 7);
    const month = Object.entries(dailyCounts).reduce((sum, [key, count]) =>
      key.startsWith(monthPrefix) ? sum + Number(count || 0) : sum, 0);
    const format = value => Number(value).toLocaleString("en-IN");
    const todayEl = document.getElementById("visitsToday");
    const weekEl = document.getElementById("visitsWeek");
    const monthEl = document.getElementById("visitsMonth");
    if (todayEl) todayEl.textContent = format(today);
    if (weekEl) weekEl.textContent = format(week);
    if (monthEl) monthEl.textContent = format(month);

    const dailyChart = document.getElementById("visitorDailyChart");
    if (dailyChart) {
      dailyChart.innerHTML = "";
      const max = Math.max(1, ...lastSevenKeys.map(key => Number(dailyCounts[key] || 0)));
      lastSevenKeys.forEach(key => {
        const count = Number(dailyCounts[key] || 0);
        const column = document.createElement("div");
        column.className = "analytics-bar-column";
        const value = document.createElement("span");
        value.className = "analytics-bar-value";
        value.textContent = format(count);
        const track = document.createElement("div");
        track.className = "analytics-bar-track";
        const bar = document.createElement("div");
        bar.className = "analytics-bar";
        bar.style.height = (count ? Math.max(5, count / max * 100) : 0) + "%";
        track.appendChild(bar);
        const label = document.createElement("span");
        label.className = "analytics-bar-label";
        label.textContent = new Intl.DateTimeFormat("en-IN", {
          timeZone: "UTC", day: "numeric", month: "short"
        }).format(new Date(key + "T12:00:00Z"));
        column.append(value, track, label);
        dailyChart.appendChild(column);
      });
    }

    // Aggregate daily records into calendar months for the rolling 12-month view.
    const [year, monthNumber] = todayKey.split("-").map(Number);
    const monthKeys = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(year, monthNumber - 1 - (11 - index), 1));
      return date.toISOString().slice(0, 7);
    });
    const monthTotals = monthKeys.map(monthKey => ({
      key: monthKey,
      count: Object.entries(dailyCounts).reduce((sum, [dayKey, value]) =>
        dayKey.startsWith(monthKey) ? sum + Number(value || 0) : sum, 0)
    }));
    const monthlyChart = document.getElementById("visitorMonthlyChart");
    if (monthlyChart) {
      monthlyChart.innerHTML = "";
      const monthlyMax = Math.max(1, ...monthTotals.map(item => item.count));
      monthTotals.forEach(item => {
        const column = document.createElement("div");
        column.className = "analytics-bar-column";
        const value = document.createElement("span");
        value.className = "analytics-bar-value";
        value.textContent = format(item.count);
        const track = document.createElement("div");
        track.className = "analytics-bar-track";
        const bar = document.createElement("div");
        bar.className = "analytics-bar";
        bar.style.height = (item.count ? Math.max(5, item.count / monthlyMax * 100) : 0) + "%";
        track.appendChild(bar);
        const label = document.createElement("span");
        label.className = "analytics-bar-label";
        label.textContent = new Intl.DateTimeFormat("en-IN", {
          timeZone: "UTC", month: "short", year: "2-digit"
        }).format(new Date(item.key + "-15T12:00:00Z"));
        column.append(value, track, label);
        monthlyChart.appendChild(column);
      });
    }

    const previousMonthDate = new Date(Date.UTC(year, monthNumber - 2, 1));
    const previousMonthKey = previousMonthDate.toISOString().slice(0, 7);
    const previousMonthTotal = monthTotals.find(item => item.key === previousMonthKey)?.count || 0;
    const comparison = document.getElementById("visitorMonthComparison");
    if (comparison) {
      if (previousMonthTotal > 0) {
        const change = ((month - previousMonthTotal) / previousMonthTotal) * 100;
        const direction = change > 0 ? "up" : change < 0 ? "down" : "unchanged";
        comparison.textContent = Math.abs(change).toFixed(1) + "% " + direction + " vs last month";
        comparison.className = "analytics-comparison " + (change > 0 ? "is-up" : change < 0 ? "is-down" : "");
      } else {
        comparison.textContent = "Previous month has no recorded baseline yet";
        comparison.className = "analytics-comparison";
      }
    }
  }

  function showLogin(message) {
    if (authScreen) authScreen.hidden = false;
    if (appShell) appShell.hidden = true;
    if (authMessage) authMessage.textContent = message || "";
  }

  function showWorkspace(user, isEditor = false) {
    if (authScreen) authScreen.hidden = true;
    if (appShell) appShell.hidden = false;
    if (signedInEmail) signedInEmail.textContent = user ? (user.email || "Team member") : "Public view";
    if (teamSignInButton) teamSignInButton.hidden = Boolean(user);
    if (signOutButton) signOutButton.hidden = !user;
    if (locationForm) locationForm.hidden = !isEditor;
    if (alertTestForm) alertTestForm.hidden = !isEditor;
    setVisitorCounterVisibility(Boolean(user && isEditor));
    canEditAlerts = Boolean(user && isEditor);
    canEditLocations = Boolean(user && isEditor);
    canManageRecords = Boolean(user && isEditor);
    ["deviceForm", "observationForm", "actionForm"].forEach(id => {
      const form = document.getElementById(id);
      if (form) form.hidden = !canManageRecords;
    });
    renderLocations(cachedLocations);
    renderAlerts(cachedAlerts);
    renderDevices(cachedDevices);
    renderObservations(cachedObservations);
    renderActions(cachedActions);
  }

  if (teamSignInButton) teamSignInButton.addEventListener("click", () => showLogin(""));
  if (publicViewButton) publicViewButton.addEventListener("click", () => showWorkspace(null));

  // The dashboard is public by default. Firebase authentication only unlocks team editing.
  function renderLocations(locations) {
    if (!locationList) return;
    locationList.innerHTML = "";
    if (!locations.length) {
      if (locationEmpty) locationEmpty.hidden = false;
      return;
    }
    if (locationEmpty) locationEmpty.hidden = true;
    locations.forEach(location => {
      const row = document.createElement("article");
      row.className = "firestore-location-card";
      const details = document.createElement("div");
      details.className = "firestore-location-details";
      const name = document.createElement("h3");
      name.textContent = location.name || "Unnamed location";
      const description = document.createElement("p");
      description.textContent = location.description || "No description added.";
      const meta = document.createElement("span");
      meta.className = "firestore-location-status";
      meta.textContent = location.status || "planned";
      details.append(name, description);
      row.append(details, meta);
      if (canEditLocations) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "location-delete-button";
        deleteButton.textContent = "Delete classroom";
        deleteButton.setAttribute("aria-label", "Delete " + (location.name || "classroom"));
        deleteButton.addEventListener("click", async () => {
          const classroomName = location.name || "this classroom";
          const confirmed = window.confirm(
            'Delete "' + classroomName + '"? Only the classroom record will be deleted. Devices, observations, and alerts linked to it will remain.'
          );
          if (!confirmed) return;
          deleteButton.disabled = true;
          deleteButton.textContent = "Deleting…";
          try {
            await window.NoiseMap.deleteLocation(location.id);
          } catch (error) {
            console.error("Could not delete classroom:", error);
            window.alert(error.code === "permission-denied"
              ? "Permission denied. Sign in with an authorised Team Fearless account."
              : "Could not delete this classroom. Please try again.");
            deleteButton.disabled = false;
            deleteButton.textContent = "Delete classroom";
          }
        });
        row.appendChild(deleteButton);
      }
      locationList.appendChild(row);
    });
  }

  function connectLocations() {
    if (!window.NoiseMap || !window.NoiseMap.configured || !locationList) return;
    if (locationStatus) locationStatus.textContent = "Loading locations from Firestore…";
    if (locationUnsubscribe) locationUnsubscribe();
    locationUnsubscribe = window.NoiseMap.subscribeLocations(locations => {
      cachedLocations = locations;
      populateAlertLocations(locations);
      populateRecordLocationSelects(locations);
      renderLocations(locations);
      if (locationStatus) locationStatus.textContent = locations.length
        ? "Live Firestore data · " + locations.length + " location(s)"
        : "Connected to Firestore · no location records yet";
    }, error => {
      console.error("Could not load locations:", error);
      if (locationStatus) locationStatus.textContent = "Could not load locations. Check Firestore rules and connection.";
    });
  }

  if (window.NoiseMap && window.NoiseMap.configured) {
    connectVisitorCounter();
    connectLocations();
    connectAlerts();
    connectDevices();
    connectObservations();
    connectActions();
    window.NoiseMap.onAuthStateChanged(async user => {
      currentUser = user;
      let isEditor = false;
      if (user) {
        try {
          isEditor = await window.NoiseMap.isTeamMember(user.uid);
        } catch (error) {
          console.error("Could not verify team membership:", error);
        }
      }
      showWorkspace(user, isEditor);
    });
  } else {
    showWorkspace(null, false);
    if (locationStatus) locationStatus.textContent = "Firebase is not configured.";
  }


  function populateAlertLocations(locations) {
    if (!alertLocationSelect) return;
    const previous = alertLocationSelect.value;
    alertLocationSelect.innerHTML = '<option value="">Select a classroom</option>';
    locations.forEach(location => {
      const option = document.createElement("option");
      option.value = location.id;
      option.textContent = location.name || "Unnamed classroom";
      option.dataset.name = location.name || "Unnamed classroom";
      alertLocationSelect.appendChild(option);
    });
    if (previous && locations.some(location => location.id === previous)) alertLocationSelect.value = previous;
  }

  function formatAlertTime(value) {
    if (!value) return "Time pending";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function renderAlerts(alerts) {
    if (!alertList) return;
    alertList.innerHTML = "";
    if (alertsEmpty) alertsEmpty.hidden = alerts.length > 0;
    alerts.forEach(alert => {
      const card = document.createElement("article");
      card.className = "staff-alert-card" + (alert.status === "resolved" ? " is-resolved" : "");
      const top = document.createElement("div");
      top.className = "staff-alert-top";
      const heading = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = alert.classroomName || "Unknown classroom";
      const time = document.createElement("p");
      time.textContent = formatAlertTime(alert.createdAt);
      heading.append(name, time);
      const status = document.createElement("span");
      status.className = "staff-alert-status " + (alert.status || "open");
      status.textContent = alert.status === "acknowledged" ? "Acknowledged" : alert.status === "resolved" ? "Resolved" : "Needs attention";
      top.append(heading, status);
      const detail = document.createElement("p");
      detail.className = "staff-alert-detail";
      detail.textContent = "Noise remained high after " + Number(alert.warningCount || 3) + " warnings · Raw sensor reading: " +
        (Number.isFinite(Number(alert.rawAdc)) ? alert.rawAdc + " ADC" : "not recorded") +
        (alert.source === "manual_test" ? " · TEST ALERT" : "");
      card.append(top, detail);
      if (canEditAlerts) {
        const actions = document.createElement("div");
        actions.className = "staff-alert-actions";
        if (alert.status !== "resolved") {
          if (alert.status !== "acknowledged") {
            const acknowledge = document.createElement("button");
            acknowledge.type = "button";
            acknowledge.textContent = "Acknowledge";
            acknowledge.addEventListener("click", () => changeAlertStatus(alert.id, "acknowledged", acknowledge));
            actions.appendChild(acknowledge);
          }
          const resolve = document.createElement("button");
          resolve.type = "button";
          resolve.className = "resolve-alert-button";
          resolve.textContent = "Mark resolved";
          resolve.addEventListener("click", () => changeAlertStatus(alert.id, "resolved", resolve));
          actions.appendChild(resolve);
        }

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "location-delete-button";
        deleteButton.textContent = "Delete alert";
        deleteButton.addEventListener("click", async () => {
          const confirmed = window.confirm(
            'Permanently delete the alert for "' + (alert.classroomName || "this classroom") + '"? This will remove only this alert record.'
          );
          if (!confirmed) return;
          deleteButton.disabled = true;
          deleteButton.textContent = "Deleting…";
          try {
            await window.NoiseMap.deleteAlert(alert.id);
          } catch (error) {
            console.error("Could not delete alert:", error);
            window.alert(error.code === "permission-denied"
              ? "Permission denied. Check your Team Fearless membership and Firestore alerts rule."
              : "Could not delete this alert. Please try again.");
            deleteButton.disabled = false;
            deleteButton.textContent = "Delete alert";
          }
        });
        actions.appendChild(deleteButton);
        card.appendChild(actions);
      }
      alertList.appendChild(card);
    });
  }

  async function changeAlertStatus(id, status, button) {
    if (!canEditAlerts || !window.NoiseMap) return;
    button.disabled = true;
    try {
      await window.NoiseMap.updateAlertStatus(id, status);
    } catch (error) {
      console.error("Could not update alert:", error);
      window.alert("Could not update this alert. Check your team permissions and Firestore rules.");
      button.disabled = false;
    }
  }

  function connectAlerts() {
    if (!window.NoiseMap || !window.NoiseMap.configured || !alertList) return;
    if (alertStatusLine) alertStatusLine.textContent = "Loading staffroom alerts…";
    if (alertUnsubscribe) alertUnsubscribe();
    alertUnsubscribe = window.NoiseMap.subscribeAlerts(alerts => {
      cachedAlerts = alerts;
      renderAlerts(alerts);
      if (alertStatusLine) alertStatusLine.textContent = "Live dashboard · " + alerts.length + " alert record(s)";
    }, error => {
      console.error("Could not load staffroom alerts:", error);
      if (alertStatusLine) alertStatusLine.textContent = "Could not load alerts. Check the Firestore alerts rule.";
    });
  }

  if (alertTestForm) {
    alertTestForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (!canEditAlerts) {
        if (alertTestMessage) alertTestMessage.textContent = "Sign in with an authorised team account first.";
        return;
      }
      const locationId = alertLocationSelect.value;
      const location = cachedLocations.find(item => item.id === locationId);
      const rawAdc = Number(document.getElementById("alertRawAdc").value);
      if (!location) {
        if (alertTestMessage) alertTestMessage.textContent = "Add and select a classroom location first.";
        return;
      }
      if (!Number.isInteger(rawAdc) || rawAdc < 0 || rawAdc > 1023) {
        if (alertTestMessage) alertTestMessage.textContent = "Enter a raw ADC value from 0 to 1023.";
        return;
      }
      alertTestSubmit.disabled = true;
      alertTestSubmit.textContent = "Creating…";
      if (alertTestMessage) alertTestMessage.textContent = "";
      try {
        await window.NoiseMap.addAlert({
          locationId,
          classroomName: location.name,
          rawAdc,
          warningCount: 3,
          source: "manual_test"
        });
        if (alertTestMessage) alertTestMessage.textContent = "Test alert created. It is now visible on the staffroom dashboard.";
      } catch (error) {
        console.error("Could not create test alert:", error);
        if (alertTestMessage) alertTestMessage.textContent = error.code === "permission-denied"
          ? "Permission denied. Check the Firestore alerts rule and teamMembers UID."
          : "Could not create the test alert. Please try again.";
      } finally {
        alertTestSubmit.disabled = false;
        alertTestSubmit.textContent = "Create test alert";
      }
    });
  }

  if (locationForm) {
    locationForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (!canEditLocations) {
        if (locationFormMessage) locationFormMessage.textContent = "Sign in with an authorised team account first.";
        return;
      }
      const name = document.getElementById("locationName").value.trim();
      const description = document.getElementById("locationDescription").value.trim();
      const status = document.getElementById("locationState").value;
      if (!name) return;
      if (locationSubmit) {
        locationSubmit.disabled = true;
        locationSubmit.textContent = "Saving…";
      }
      if (locationFormMessage) locationFormMessage.textContent = "";
      try {
        await window.NoiseMap.addLocation({ name, description, status });
        locationForm.reset();
        if (locationFormMessage) locationFormMessage.textContent = "Location saved to Firestore.";
      } catch (error) {
        console.error("Could not save location:", error);
        if (locationFormMessage) locationFormMessage.textContent =
          error.code === "permission-denied"
            ? "Permission denied. Check that this account's UID is in teamMembers."
            : "Could not save the location. Please try again.";
      } finally {
        if (locationSubmit) {
          locationSubmit.disabled = false;
          locationSubmit.textContent = "Add location";
        }
      }
    });
  }


  function populateRecordLocationSelects(locations) {
    ["deviceLocation", "observationLocation"].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const previous = select.value;
      select.innerHTML = '<option value="">Select a location</option>';
      locations.forEach(location => {
        const option = document.createElement("option");
        option.value = location.id;
        option.textContent = location.name || "Unnamed location";
        select.appendChild(option);
      });
      if (previous && locations.some(location => location.id === previous)) select.value = previous;
    });
  }

  function populateDeviceSelects(devices) {
    ["observationDevice"].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const previous = select.value;
      select.innerHTML = '<option value="">No device selected</option>';
      devices.forEach(device => {
        const option = document.createElement("option");
        option.value = device.id;
        option.textContent = device.deviceId || "Unnamed device";
        select.appendChild(option);
      });
      if (previous && devices.some(device => device.id === previous)) select.value = previous;
    });
  }

  function recordCard(title, description, meta, collection, id) {
    const card = document.createElement("article");
    card.className = "firestore-location-card";
    const details = document.createElement("div");
    details.className = "firestore-location-details";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const body = document.createElement("p");
    body.textContent = description || "No additional details.";
    const foot = document.createElement("p");
    foot.textContent = meta || "";
    details.append(heading, body, foot);
    card.appendChild(details);
    if (canManageRecords) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "location-delete-button";
      button.textContent = "Delete";
      button.addEventListener("click", async () => {
        if (!window.confirm("Permanently delete this " + collection + " record? This cannot be undone.")) return;
        button.disabled = true;
        button.textContent = "Deleting…";
        try {
          await window.NoiseMap["delete" + collection](id);
        } catch (error) {
          console.error("Could not delete " + collection + " record:", error);
          window.alert(error.code === "permission-denied"
            ? "Permission denied. Sign in with an authorised Team Fearless account and check the Firestore rules."
            : "Could not delete this record. Please try again.");
          button.disabled = false;
          button.textContent = "Delete";
        }
      });
      card.appendChild(button);
    }
    return card;
  }

  function renderDevices(devices) {
    const list = document.getElementById("deviceList");
    const empty = document.getElementById("deviceEmpty");
    const monitorGrid = document.getElementById("deviceMonitorGrid");
    const totalEl = document.getElementById("deviceTotal");
    const recentEl = document.getElementById("deviceRecent");
    const waitingEl = document.getElementById("deviceWaiting");
    const noteEl = document.getElementById("deviceMonitorNote");
    if (!list) return;
    list.innerHTML = "";
    if (empty) empty.hidden = devices.length > 0;
    if (monitorGrid) monitorGrid.innerHTML = "";
    let recentCount = 0;
    const now = Date.now();
    const recentWindowMs = 5 * 60 * 1000;

    devices.forEach(device => {
      const location = cachedLocations.find(item => item.id === device.locationId);
      const latest = cachedObservations.find(item => item.deviceId === device.id);
      const raw = latest ? (latest.rawValue ?? latest.rawAdc ?? latest.raw_adc) : null;
      const timeValue = latest && (latest.timestamp || latest.createdAt);
      const readingDate = timeValue
        ? (typeof timeValue.toDate === "function" ? timeValue.toDate() : new Date(timeValue))
        : null;
      const ageMs = readingDate && !Number.isNaN(readingDate.getTime()) ? now - readingDate.getTime() : Infinity;
      const isRecent = ageMs >= 0 && ageMs <= recentWindowMs;
      if (isRecent) recentCount++;

      if (monitorGrid) {
        const card = document.createElement("article");
        card.className = "device-monitor-card";
        const top = document.createElement("div");
        top.className = "device-monitor-card-top";
        const name = document.createElement("h3");
        name.textContent = device.deviceId || "Unnamed device";
        const status = document.createElement("span");
        status.className = "device-monitor-status " + (isRecent ? "is-recent" : latest ? "is-stale" : "is-waiting");
        status.textContent = isRecent ? "Recent reading" : latest ? "No recent reading" : "Awaiting data";
        top.append(name, status);
        const reading = document.createElement("div");
        reading.className = "device-monitor-reading";
        reading.textContent = raw === null || raw === undefined ? "—" : String(raw);
        const unit = document.createElement("span");
        unit.className = "device-monitor-unit";
        unit.textContent = "RAW ADC · 0–1023";
        const locationText = document.createElement("p");
        locationText.className = "device-monitor-meta";
        locationText.textContent = "Location: " + (location ? location.name : "Not linked");
        const lastSeen = document.createElement("p");
        lastSeen.className = "device-monitor-meta";
        lastSeen.textContent = "Last reading: " + (latest ? formatAlertTime(timeValue) : "No reading recorded");
        const hardware = document.createElement("p");
        hardware.className = "device-monitor-meta";
        hardware.textContent = "Hardware: " + (device.hardware || "Not specified");
        card.append(top, reading, unit, locationText, lastSeen, hardware);
        monitorGrid.appendChild(card);
      }

      list.appendChild(recordCard(
        device.deviceId || "Unnamed device",
        device.hardware || "Hardware not specified",
        "Location: " + (location ? location.name : "Not linked") + " · Registered status: " + (device.connectionStatus || "unknown"),
        "Device", device.id
      ));
    });

    if (totalEl) totalEl.textContent = String(devices.length);
    if (recentEl) recentEl.textContent = String(recentCount);
    if (waitingEl) waitingEl.textContent = String(devices.length - recentCount);
    if (noteEl) noteEl.textContent = devices.length
      ? "A recent reading means an observation was saved within the last 5 minutes. This is not proof of a continuous device connection. ADC values are raw readings, not dB/dB(A)."
      : "No devices are registered yet. Add a device below to begin tracking its saved observations.";
    populateDeviceSelects(devices);
  }

  function renderObservations(observations) {
    const list = document.getElementById("observationList");
    const empty = document.getElementById("observationEmpty");
    if (!list) return;
    list.innerHTML = "";
    if (empty) empty.hidden = observations.length > 0;
    observations.forEach(observation => {
      const location = cachedLocations.find(item => item.id === observation.locationId);
      const device = cachedDevices.find(item => item.id === observation.deviceId);
      const raw = observation.rawValue ?? observation.rawAdc ?? observation.raw_adc;
      const dateValue = observation.timestamp || observation.createdAt;
      list.appendChild(recordCard(
        location ? location.name : "Observation record",
        "Raw reading: " + (raw === undefined ? "not recorded" : raw + " ADC") + " · Device: " + (device ? device.deviceId : (observation.deviceId || "Not linked")),
        "Recorded: " + formatAlertTime(dateValue),
        "Observation", observation.id
      ));
    });
  }

  function renderActions(actions) {
    const list = document.getElementById("actionList");
    const empty = document.getElementById("actionEmpty");
    if (!list) return;
    list.innerHTML = "";
    if (empty) empty.hidden = actions.length > 0;
    actions.forEach(action => {
      list.appendChild(recordCard(
        action.description || "Action record",
        "Responsible: " + (action.responsible || "Not assigned") + " · Status: " + (action.responseStatus || "not verified"),
        "Action date: " + (action.actionDate || "Not recorded") + (action.evidenceUrl ? " · Evidence: " + action.evidenceUrl : ""),
        "Action", action.id
      ));
    });
  }

  function connectDevices() {
    if (!window.NoiseMap || !window.NoiseMap.configured) return;
    deviceUnsubscribe = window.NoiseMap.subscribeDevices(items => {
      cachedDevices = items;
      renderDevices(items);
      renderObservations(cachedObservations);
    }, error => console.error("Could not load devices:", error));
  }

  function connectObservations() {
    if (!window.NoiseMap || !window.NoiseMap.configured) return;
    observationUnsubscribe = window.NoiseMap.subscribeObservations(items => {
      cachedObservations = items;
      renderObservations(items);
      renderDevices(cachedDevices);
    }, error => console.error("Could not load observations:", error));
  }

  function connectActions() {
    if (!window.NoiseMap || !window.NoiseMap.configured) return;
    actionUnsubscribe = window.NoiseMap.subscribeActions(items => {
      cachedActions = items;
      renderActions(items);
    }, error => console.error("Could not load actions:", error));
  }

  function wireRecordForm(formId, submitId, submitLabel, createMethod, collectData, successMessage) {
    const form = document.getElementById(formId);
    if (!form) return;
    const button = document.getElementById(submitId);
    const message = document.getElementById(formId + "Message");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!canManageRecords) {
        if (message) message.textContent = "Sign in with an authorised Team Fearless account first.";
        return;
      }
      if (button) { button.disabled = true; button.textContent = "Saving…"; }
      if (message) message.textContent = "";
      try {
        await window.NoiseMap[createMethod](collectData());
        form.reset();
        if (message) message.textContent = successMessage;
      } catch (error) {
        console.error("Could not save record:", error);
        if (message) message.textContent = error.code === "permission-denied"
          ? "Permission denied. Check Team Fearless membership and Firestore rules."
          : "Could not save this record. Please try again.";
      } finally {
        if (button) { button.disabled = false; button.textContent = submitLabel; }
      }
    });
  }

  wireRecordForm("deviceForm", "deviceSubmit", "Add device", "addDevice", () => ({
    deviceId: document.getElementById("deviceId").value.trim(),
    locationId: document.getElementById("deviceLocation").value,
    hardware: document.getElementById("deviceHardware").value.trim(),
    connectionStatus: document.getElementById("deviceStatus").value
  }), "Device added to NoiseMap.");

  wireRecordForm("observationForm", "observationSubmit", "Add observation", "addObservation", () => {
    const rawValue = Number(document.getElementById("observationRawValue").value);
    const dateInput = document.getElementById("observationTimestamp").value;
    return {
      deviceId: document.getElementById("observationDevice").value || null,
      locationId: document.getElementById("observationLocation").value || null,
      rawValue,
      measurementType: "raw_adc",
      unit: "ADC (0-1023)",
      timestamp: dateInput ? new Date(dateInput) : null
    };
  }, "Observation added to historical data.");

  wireRecordForm("actionForm", "actionSubmit", "Add action", "addAction", () => ({
    description: document.getElementById("actionDescription").value.trim(),
    actionDate: document.getElementById("actionDate").value || null,
    responsible: document.getElementById("actionResponsible").value.trim(),
    responseStatus: document.getElementById("actionStatus").value,
    evidenceUrl: document.getElementById("actionEvidence").value.trim()
  }), "Action added to the tracker.");

  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (!window.NoiseMap || !window.NoiseMap.configured) {
        showLogin("Firebase is not available. Please refresh and try again.");
        return;
      }
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = "Signing in…";
      }
      if (authMessage) authMessage.textContent = "";
      try {
        await window.NoiseMap.signIn(email, password);
      } catch (error) {
        const messages = {
          "auth/invalid-email": "Please enter a valid email address.",
          "auth/user-disabled": "This account has been disabled. Contact the administrator.",
          "auth/user-not-found": "No authorised account was found for this email.",
          "auth/wrong-password": "Incorrect password. Please try again.",
          "auth/invalid-credential": "Email or password is incorrect. Please try again.",
          "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
          "auth/unauthorized-domain": "This website domain is not authorised in Firebase Authentication settings."
        };
        if (authMessage) authMessage.textContent = messages[error.code] || "Sign-in failed. Check your details and try again.";
      } finally {
        if (loginButton) {
          loginButton.disabled = false;
          loginButton.textContent = "Sign in to NoiseMap";
        }
      }
    });
  }

  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      try {
        await window.NoiseMap.signOut();
      } catch (error) {
        window.alert("Could not sign out. Please try again.");
      }
    });
  }

  const dateLabel = document.getElementById("todayLabel");
  if (dateLabel) {
    dateLabel.textContent = new Intl.DateTimeFormat("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    }).format(new Date());
  }

  const links = document.querySelectorAll(".nav-link");
  const pageName = document.getElementById("pageName");
  const menuButton = document.getElementById("menuButton");
  const sidebar = document.getElementById("sidebar");
  function setActive() {
    const id = (location.hash || "#overview").slice(1);
    links.forEach(link => {
      const active = link.dataset.page === id;
      link.classList.toggle("active", active);
      if (active && pageName) pageName.textContent = link.textContent.trim();
    });
    if (sidebar) sidebar.classList.remove("open");
  }
  links.forEach(link => link.addEventListener("click", () => setTimeout(setActive, 0)));
  window.addEventListener("hashchange", setActive);
  if (menuButton && sidebar) menuButton.addEventListener("click", () => sidebar.classList.toggle("open"));
  setActive();
})();