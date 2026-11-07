// NoiseMap UI and Firebase email/password authentication.
// Dashboard sample readings remain illustrative until real device data is connected.
(function () {
  const authScreen = document.getElementById("authScreen");
  const appShell = document.getElementById("appShell");
  const loginForm = document.getElementById("loginForm");
  const loginButton = document.getElementById("loginButton");
  const authMessage = document.getElementById("authMessage");
  const signOutButton = document.getElementById("signOutButton");
  const signedInEmail = document.getElementById("signedInEmail");

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
  let locationUnsubscribe = null;

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
    canEditAlerts = Boolean(user && isEditor);
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
    connectLocations();
    connectAlerts();
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
      if (canEditAlerts && alert.status !== "resolved") {
        const actions = document.createElement("div");
        actions.className = "staff-alert-actions";
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
      if (!currentUser) {
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

  const labels = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM"];
  const demoValues = [24, 31, 28, 43, 37, 56, 48, 62, 51, 45, 58];

  const dateLabel = document.getElementById("todayLabel");
  if (dateLabel) {
    dateLabel.textContent = new Intl.DateTimeFormat("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    }).format(new Date());
  }

  const canvas = document.getElementById("noiseChart");
  function drawChart() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const w = rect.width, h = rect.height;
    const pad = { top: 12, right: 10, bottom: 12, left: 27 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const max = 80;
    ctx.font = "9px DM Sans, sans-serif";
    ctx.textAlign = "right";
    [0, 20, 40, 60, 80].forEach(value => {
      const y = pad.top + plotH - (value / max) * plotH;
      ctx.strokeStyle = "#edf1f3";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = "#a1adb6";
      ctx.fillText(String(value), pad.left - 8, y + 3);
    });
    const points = demoValues.map((value, i) => ({
      x: pad.left + (i / (demoValues.length - 1)) * plotW,
      y: pad.top + plotH - (value / max) * plotH
    }));
    const gradient = ctx.createLinearGradient(0, pad.top, 0, h);
    gradient.addColorStop(0, "rgba(22,168,153,.20)");
    gradient.addColorStop(1, "rgba(22,168,153,0)");
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + plotH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + plotH);
    ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = "#16a899"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    points.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#16a899"; ctx.lineWidth = 2; ctx.stroke();
    });
  }
  drawChart();
  window.addEventListener("resize", drawChart);

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