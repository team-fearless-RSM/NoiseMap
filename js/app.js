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
  let currentUser = null;
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