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
  const locationHistoryRanges = Object.create(null);
  let alertUnsubscribe = null;
  let currentUser = null;
  let canEditAlerts = false;
  let canEditLocations = false;
  let canManageRecords = false;
  let cachedDevices = [];
  let cachedObservations = [];
  let cachedActions = [];
  let cachedEndpointTests = [];
  let endpointTestUnsubscribe = null;
  let deviceUnsubscribe = null;
  let observationUnsubscribe = null;
  let actionUnsubscribe = null;
  let cachedAlerts = [];
  let locationUnsubscribe = null;
  let simulatorInterval = null;
  let simulatorSessionId = null;
  let simulatorReadingCount = 0;
  const NM_HEARTBEAT_TIMEOUT_MS = 120000;
  let observationsConnectionReady = false;

  const audioMonitorStatus = document.getElementById("audioMonitorStatus");
  if (window.NoiseAudio) {
    window.NoiseAudio.init({
      onIncident: async incident => {
        if (!canEditAlerts || !window.NoiseMap || !window.NoiseMap.configured) {
          throw new Error("Sign in with an authorised Team Fearless account to save threshold incidents.");
        }
        if (cachedAlerts.some(alert => alert.id === incident.incidentId)) return { duplicate: true };
        return window.NoiseMap.addAlert({
          incidentId: incident.incidentId,
          locationId: incident.locationId,
          classroomName: incident.locationName,
          deviceId: incident.deviceId,
          rawAdc: incident.rawAdc,
          thresholdAdc: incident.thresholdAdc,
          triggerDurationSeconds: incident.durationSeconds,
          incidentStartedAt: incident.startAt,
          warningCount: 0,
          source: "web_audio_threshold"
        });
      }
    });
  }

  function updateAudioMonitorFromObservations(items) {
    if (!window.NoiseAudio) return;
    if (!canManageRecords) {
      window.NoiseAudio.resetAll();
      return;
    }
    const latestByLocation = new Map();
    (items || []).forEach(observation => {
      if (!observation || observation.isSimulated === true || observation.source !== "esp8266") return;
      const device = cachedDevices.find(entry => entry.id === observation.deviceId);
      const locationId = observation.locationId || (device && device.locationId);
      const date = dashboardDate(observation.timestamp || observation.createdAt);
      if (!locationId || !date) return;
      const existing = latestByLocation.get(locationId);
      if (!existing || date.getTime() > existing.date.getTime()) {
        latestByLocation.set(locationId, { observation, device, date });
      }
    });

    const now = Date.now();
    latestByLocation.forEach((entry, locationId) => {
      const observation = entry.observation;
      const location = cachedLocations.find(item => item.id === locationId);
      const raw = observation.rawValue ?? observation.rawAdc ?? observation.raw_adc;
      window.NoiseAudio.evaluateReading({
        locationId,
        locationName: location ? location.name : "Classroom",
        deviceId: observation.deviceId,
        readingId: observation.id,
        adc: Number(raw),
        timestamp: entry.date.getTime(),
        source: observation.source,
        isOnline: Boolean(entry.device && getDeviceHeartbeatState(entry.device, now).online)
      });
    });

    cachedLocations.forEach(location => {
      if (!latestByLocation.has(location.id)) window.NoiseAudio.resetLocation(location.id);
    });
  }


  function setLoadingTimeout(element, loadingText, timeoutMessage, delayMs = 10000) {
    if (!element) return;
    window.setTimeout(() => {
      if (element.textContent.trim() === loadingText) element.textContent = timeoutMessage;
    }, delayMs);
  }

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
    setLoadingTimeout(visitorCountStatus, "Loading visit count…", "Visit count is taking too long to load. Check your connection.");
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
    document.querySelectorAll('[data-team-only="true"]').forEach(element => {
      element.hidden = !canManageRecords;
    });
    const endpointTestPanel = document.getElementById("endpointTestPanel");
    if (endpointTestPanel) endpointTestPanel.hidden = !canManageRecords;
    if (canManageRecords) {
      connectEndpointTests();
    } else {
      if (endpointTestUnsubscribe) {
        endpointTestUnsubscribe();
        endpointTestUnsubscribe = null;
      }
      cachedEndpointTests = [];
      renderEndpointTests([]);
    }
    const simulatorPanel = document.getElementById('sensorSimulator');
    if (simulatorPanel) simulatorPanel.hidden = !canManageRecords;
    if (!canManageRecords) stopSensorSimulator('Simulator stopped. Sign in as an authorised team member to use test mode.');
    ["deviceForm", "observationForm", "actionForm"].forEach(id => {
      const form = document.getElementById(id);
      if (form) form.hidden = !canManageRecords;
    });
    renderLocations(cachedLocations);
    renderAlerts(cachedAlerts);
    renderDevices(cachedDevices);
    renderObservations(cachedObservations);
    renderActions(cachedActions);
    renderDashboard();
  }

  if (teamSignInButton) teamSignInButton.addEventListener("click", () => showLogin(""));
  if (publicViewButton) publicViewButton.addEventListener("click", () => showWorkspace(null));

  // Keep the overview tied to saved Firestore records; never invent sample readings.
  function dashboardDate(value) {
    if (!value) return null;
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }


  function renderLiveMonitoring() {
    const rangeSelect = document.getElementById("liveMonitorRange");
    const locationSelect = document.getElementById("liveMonitorLocation");
    const chartWrap = document.getElementById("liveChartWrap");
    if (!rangeSelect || !chartWrap) return;
    const rangeDays = Number(rangeSelect.value || 7);
    const selectedLocation = locationSelect ? locationSelect.value : "all";
    const now = Date.now();
    const cutoff = now - rangeDays * 24 * 60 * 60 * 1000;
    const parseDate = item => dashboardDate(item.timestamp || item.createdAt);
    const matchesLocation = item => {
      if (selectedLocation === "all") return true;
      const device = cachedDevices.find(entry => entry.id === item.deviceId);
      return item.locationId === selectedLocation || (!item.locationId && device && device.locationId === selectedLocation);
    };
    const inRange = cachedObservations.filter(item => {
      const date = parseDate(item);
      return date && date.getTime() >= cutoff && date.getTime() <= now && matchesLocation(item);
    });
    const real = inRange.filter(item => item.isSimulated !== true && item.source !== "browser_simulator" &&
      Number.isFinite(Number(item.rawValue ?? item.rawAdc ?? item.raw_adc)));
    const tests = inRange.filter(item => item.isSimulated === true || item.source === "browser_simulator");
    const sortedReal = [...real].sort((a,b) => parseDate(a) - parseDate(b));
    const latest = sortedReal[sortedReal.length - 1] || null;
    const setText = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=String(value); };
    setText("liveLatestValue", latest ? String(latest.rawValue ?? latest.rawAdc ?? latest.raw_adc) + " ADC" : "—");
    setText("liveLatestTime", latest ? formatAlertTime(latest.timestamp || latest.createdAt) : "No non-simulated reading yet");
    setText("liveReadingCount", real.length);
    setText("liveTestCount", tests.length);
    const reportingDevices = cachedDevices.filter(device =>
      getDeviceHeartbeatState(device, now).online &&
      (selectedLocation === "all" || device.locationId === selectedLocation)
    );
    setText("liveReportingDevices", reportingDevices.length);
    const connection = document.getElementById("liveMonitorConnection");
    if (connection && observationsConnectionReady) connection.textContent = "Firestore updates · " + cachedObservations.length + " saved observation(s) loaded";
    const subtitle = document.getElementById("liveChartSubtitle");
    if (subtitle) subtitle.textContent = "Last " + rangeDays + (rangeDays === 1 ? " day" : " days") + " · " + real.length + " non-simulated observation(s) · raw ADC";
    chartWrap.innerHTML = "";
    if (sortedReal.length < 2) {
      const empty = document.createElement("p");
      empty.className = "dashboard-empty-text";
      empty.textContent = sortedReal.length === 1
        ? "One non-simulated observation is available. A trend line will appear after another non-simulated reading is saved."
        : "No non-simulated sensor observations in this time range. Simulated readings are excluded from this graph.";
      chartWrap.appendChild(empty);
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 760 250"); svg.setAttribute("role","img");
      svg.setAttribute("aria-label","Raw ADC trend for non-simulated sensor observations");
      const values = sortedReal.map(item => Number(item.rawValue ?? item.rawAdc ?? item.raw_adc));
      const min = Math.min(...values), max = Math.max(...values), span = Math.max(1,max-min);
      [0,1,2,3].forEach(i => {
        const y = 25 + i*58;
        const grid = document.createElementNS("http://www.w3.org/2000/svg","line");
        grid.setAttribute("x1","48"); grid.setAttribute("x2","735");
        grid.setAttribute("y1",String(y)); grid.setAttribute("y2",String(y));
        grid.setAttribute("stroke","#e8eff1"); grid.setAttribute("stroke-dasharray","4 5");
        svg.appendChild(grid);
      });
      const points = values.map((value,index) => {
        const x = 48 + index * (687 / Math.max(1,values.length-1));
        const y = 205 - ((value-min)/span)*160;
        return x.toFixed(1)+","+y.toFixed(1);
      }).join(" ");
      const line = document.createElementNS("http://www.w3.org/2000/svg","polyline");
      line.setAttribute("points",points); line.setAttribute("fill","none");
      line.setAttribute("stroke","#16a899"); line.setAttribute("stroke-width","3");
      line.setAttribute("stroke-linecap","round"); line.setAttribute("stroke-linejoin","round");
      svg.appendChild(line);
      values.forEach((value,index) => {
        const x = 48 + index * (687 / Math.max(1,values.length-1));
        const y = 205 - ((value-min)/span)*160;
        const dot = document.createElementNS("http://www.w3.org/2000/svg","circle");
        dot.setAttribute("cx",String(x)); dot.setAttribute("cy",String(y)); dot.setAttribute("r","3.5");
        dot.setAttribute("fill","#0d887d"); svg.appendChild(dot);
      });
      const maxLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
      maxLabel.setAttribute("x","8"); maxLabel.setAttribute("y","30"); maxLabel.textContent=String(max);
      const minLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
      minLabel.setAttribute("x","8"); minLabel.setAttribute("y","208"); minLabel.textContent=String(min);
      svg.append(maxLabel,minLabel); chartWrap.appendChild(svg);
      const note = document.createElement("p"); note.className="live-chart-footnote";
      note.textContent="Observed range: "+min+"–"+max+" ADC. Each point is a saved observation; this is not a calibrated sound-pressure graph.";
      chartWrap.appendChild(note);
    }

    // Separate test-data trend so simulator activity never mixes with non-simulated observations.
    const drawTrendChart = (containerId, items, label) => {
      const container=document.getElementById(containerId);
      if(!container) return;
      container.innerHTML="";
      const ordered=[...items].sort((a,b)=>parseDate(a)-parseDate(b));
      if(!ordered.length){
        const empty=document.createElement("p");empty.className="dashboard-empty-text";
        empty.textContent="No "+label.toLowerCase()+" readings in this time range.";
        container.appendChild(empty);return;
      }
      const values=ordered.map(item=>Number(item.rawValue??item.rawAdc??item.raw_adc));
      const min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 760 250");svg.setAttribute("role","img");
      svg.setAttribute("aria-label",label+" raw ADC readings over time");
      [0,1,2,3].forEach(i=>{
        const y=25+i*58,g=document.createElementNS("http://www.w3.org/2000/svg","line");
        g.setAttribute("x1","48");g.setAttribute("x2","735");g.setAttribute("y1",String(y));g.setAttribute("y2",String(y));
        g.setAttribute("stroke","#e8eff1");g.setAttribute("stroke-dasharray","4 5");svg.appendChild(g);
      });
      const pts=values.map((v,i)=>({x:48+i*(687/Math.max(1,values.length-1)),y:205-((v-min)/span)*160}));
      if(pts.length>1){
        const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
        line.setAttribute("points",pts.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join(" "));
        line.setAttribute("fill","none");line.setAttribute("stroke","#c18b36");line.setAttribute("stroke-width","3");
        line.setAttribute("stroke-linecap","round");line.setAttribute("stroke-linejoin","round");svg.appendChild(line);
      }
      pts.forEach((p,i)=>{
        const dot=document.createElementNS("http://www.w3.org/2000/svg","circle");
        dot.setAttribute("cx",String(p.x));dot.setAttribute("cy",String(p.y));dot.setAttribute("r","4");dot.setAttribute("fill","#c18b36");
        const title=document.createElementNS("http://www.w3.org/2000/svg","title");
        title.textContent=values[i]+" ADC · "+formatAlertTime(ordered[i].timestamp||ordered[i].createdAt);
        dot.appendChild(title);svg.appendChild(dot);
      });
      const hi=document.createElementNS("http://www.w3.org/2000/svg","text");hi.setAttribute("x","8");hi.setAttribute("y","30");hi.textContent=String(max);
      const lo=document.createElementNS("http://www.w3.org/2000/svg","text");lo.setAttribute("x","8");lo.setAttribute("y","208");lo.textContent=String(min);
      svg.append(hi,lo);container.appendChild(svg);
      const note=document.createElement("p");note.className="live-chart-footnote";
      note.textContent=ordered.length+" saved "+label.toLowerCase()+" reading(s) · "+min+"–"+max+" ADC · not dB/dB(A)";
      container.appendChild(note);
    };
    drawTrendChart("liveTestChartWrap",tests,"Simulated test");

    // Descriptive location comparison using non-simulated raw ADC averages only.
    const locationBuckets=new Map();
    real.forEach(item=>{
      const raw=Number(item.rawValue??item.rawAdc??item.raw_adc);
      if(!Number.isFinite(raw)) return;
      const device=cachedDevices.find(entry=>entry.id===item.deviceId);
      const locationId=item.locationId||(device&&device.locationId)||"unassigned";
      const location=cachedLocations.find(entry=>entry.id===locationId);
      const name=location?location.name:(locationId==="unassigned"?"Unassigned":locationId);
      if(!locationBuckets.has(name))locationBuckets.set(name,[]);
      locationBuckets.get(name).push(raw);
    });
    const locationWrap=document.getElementById("liveLocationChartWrap");
    if(locationWrap){
      locationWrap.innerHTML="";
      const groups=[...locationBuckets.entries()].map(([name,values])=>({
        name,count:values.length,average:values.reduce((sum,v)=>sum+v,0)/values.length
      })).sort((a,b)=>b.average-a.average);
      if(!groups.length){
        const empty=document.createElement("p");empty.className="dashboard-empty-text";
        empty.textContent="No non-simulated readings with location information are available in this time range.";
        locationWrap.appendChild(empty);
      }else{
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("viewBox","0 0 760 "+Math.max(170,groups.length*58+35));
        svg.setAttribute("role","img");svg.setAttribute("aria-label","Average raw ADC by monitoring location");
        const maxAvg=Math.max(1,...groups.map(g=>g.average));
        groups.forEach((group,index)=>{
          const y=18+index*58,label=document.createElementNS("http://www.w3.org/2000/svg","text");
          label.setAttribute("x","8");label.setAttribute("y",String(y+17));
          label.textContent=group.name.length>20?group.name.slice(0,18)+"…":group.name;svg.appendChild(label);
          const bar=document.createElementNS("http://www.w3.org/2000/svg","rect");
          bar.setAttribute("x","190");bar.setAttribute("y",String(y));bar.setAttribute("width",String(500*group.average/maxAvg));
          bar.setAttribute("height","25");bar.setAttribute("rx","5");bar.setAttribute("fill","#5b8fc5");svg.appendChild(bar);
          const val=document.createElementNS("http://www.w3.org/2000/svg","text");
          val.setAttribute("x",String(198+500*group.average/maxAvg));val.setAttribute("y",String(y+17));
          val.textContent=Math.round(group.average)+" ADC · n="+group.count;svg.appendChild(val);
        });
        locationWrap.appendChild(svg);
        const note=document.createElement("p");note.className="live-chart-footnote";
        note.textContent="Descriptive averages of saved raw ADC values. Sensor orientation, gain and calibration can affect comparisons; this is not a calibrated noise-level ranking.";
        locationWrap.appendChild(note);
      }
    }

    const renderRows = (containerId,items,isTest) => {
      const container=document.getElementById(containerId);
      if(!container) return;
      container.innerHTML="";
      const rows=[...items].sort((a,b)=>(parseDate(b)?.getTime()||0)-(parseDate(a)?.getTime()||0)).slice(0,12);
      if(!rows.length) {
        const empty=document.createElement("p"); empty.className="dashboard-empty-text";
        empty.textContent=isTest?"No simulated observations in this range.":"No non-simulated observations in this range.";
        container.appendChild(empty); return;
      }
      rows.forEach(item=>{
        const device=cachedDevices.find(entry=>entry.id===item.deviceId);
        const location=cachedLocations.find(entry=>entry.id===item.locationId) ||
          (device?cachedLocations.find(entry=>entry.id===device.locationId):null);
        const row=document.createElement("div"); row.className="live-monitor-row";
        const main=document.createElement("div");
        const title=document.createElement("strong"); title.textContent=(location?location.name:"Unassigned location")+" · "+(device?device.deviceId:"Unlinked device");
        const meta=document.createElement("span"); meta.textContent=formatAlertTime(item.timestamp||item.createdAt)+" · "+(item.source||"source not specified");
        const value=document.createElement("b"); value.textContent=String(item.rawValue??item.rawAdc??item.raw_adc??"—")+" ADC";
        main.append(title,meta); row.append(main,value);
        if(isTest){const tag=document.createElement("small");tag.className="dashboard-simulated-tag";tag.textContent="SIMULATED";row.appendChild(tag);}
        container.appendChild(row);
      });
    };
    renderRows("liveRealReadings",real,false);
    renderRows("liveTestReadings",tests,true);
  }

  const liveRangeControl = document.getElementById("liveMonitorRange");
  const liveLocationControl = document.getElementById("liveMonitorLocation");
  if (liveRangeControl) liveRangeControl.addEventListener("change", renderLiveMonitoring);
  if (liveLocationControl) liveLocationControl.addEventListener("change", renderLiveMonitoring);

  function populateLiveMonitoringLocations(locations) {
    const select = document.getElementById("liveMonitorLocation");
    if (!select) return;
    const previous = select.value || "all";
    select.innerHTML = '<option value="all">All locations</option>';
    locations.forEach(location => {
      const option = document.createElement("option");
      option.value = location.id;
      option.textContent = location.name || "Unnamed location";
      select.appendChild(option);
    });
    select.value = locations.some(location => location.id === previous) ? previous : "all";
  }

  function renderDashboard() {
    renderLiveMonitoring();
    const activeLocations = cachedLocations.filter(item => String(item.status || "").toLowerCase() === "active");
    const now = Date.now();
    const recentlyReporting = cachedDevices.filter(device =>
      getDeviceHeartbeatState(device, now).online
    ).length;
    const openAlerts = cachedAlerts.filter(alert => alert.status !== "resolved");

    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    };
    setValue("dashboardActiveLocations", activeLocations.length);
    setValue("dashboardDeviceTotal", cachedDevices.length);
    setValue("dashboardRecentDevices", recentlyReporting);
    setValue("dashboardOpenAlerts", openAlerts.length);
    const setupNotice = document.getElementById("dashboardSetupNotice");
    if (setupNotice) setupNotice.hidden = cachedLocations.length > 0 || cachedDevices.length > 0 || cachedObservations.length > 0;

    const readingsList = document.getElementById("dashboardLatestReadings");
    if (readingsList) {
      readingsList.innerHTML = "";
      const recentObservations = [...cachedObservations].sort((a, b) => {
        const ad = dashboardDate(a.timestamp || a.createdAt);
        const bd = dashboardDate(b.timestamp || b.createdAt);
        return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
      }).slice(0, 5);
      if (!recentObservations.length) {
        readingsList.innerHTML = '<p class="dashboard-empty-text">No sensor readings recorded yet.</p>';
      } else {
        recentObservations.forEach(observation => {
          const device = cachedDevices.find(item => item.id === observation.deviceId);
          const location = cachedLocations.find(item => item.id === observation.locationId) ||
            (device ? cachedLocations.find(item => item.id === device.locationId) : null);
          const raw = observation.rawValue ?? observation.rawAdc ?? observation.raw_adc;
          const row = document.createElement("article");
          row.className = "dashboard-record";
          const main = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = location ? location.name : (device ? device.deviceId : "Unassigned reading");
          const meta = document.createElement("span");
          meta.textContent = (device ? device.deviceId : "Device not linked") + " · " + formatAlertTime(observation.timestamp || observation.createdAt);
          main.append(title, meta);
          const value = document.createElement("b");
          value.className = "dashboard-reading-value";
          value.textContent = raw === undefined || raw === null ? "—" : String(raw) + " ADC";
          row.append(main, value);
          if (observation.isSimulated) {
            const simulated = document.createElement("small");
            simulated.className = "dashboard-simulated-tag";
            simulated.textContent = "SIMULATED";
            row.appendChild(simulated);
          }
          readingsList.appendChild(row);
        });
      }
    }

    const alertsList = document.getElementById("dashboardRecentAlerts");
    if (alertsList) {
      alertsList.innerHTML = "";
      const recent = [...cachedAlerts].sort((a, b) => {
        const ad = dashboardDate(a.createdAt);
        const bd = dashboardDate(b.createdAt);
        return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
      }).slice(0, 5);
      if (!recent.length) {
        alertsList.innerHTML = '<p class="dashboard-empty-text">No alerts recorded yet.</p>';
      } else {
        recent.forEach(alert => {
          const row = document.createElement("article");
          row.className = "dashboard-record";
          const main = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = alert.classroomName || "Unknown location";
          const meta = document.createElement("span");
          meta.textContent = formatAlertTime(alert.createdAt) + " · " +
            (Number.isFinite(Number(alert.rawAdc)) ? alert.rawAdc + " ADC" : "Reading unavailable");
          main.append(title, meta);
          const status = document.createElement("b");
          status.className = "dashboard-alert-status " + (alert.status || "open");
          status.textContent = alert.status === "resolved" ? "Resolved" :
            alert.status === "acknowledged" ? "Acknowledged" : "Open";
          row.append(main, status);
          alertsList.appendChild(row);
        });
      }
    }

    const locationsList = document.getElementById("dashboardLocationLinks");
    if (locationsList) {
      locationsList.innerHTML = "";
      if (!cachedLocations.length) {
        locationsList.innerHTML = '<p class="dashboard-empty-text">No locations added yet.</p>';
      } else {
        cachedLocations.forEach(location => {
          const link = document.createElement("a");
          link.className = "dashboard-location-link";
          link.href = "#location-" + encodeURIComponent(location.id);
          const name = document.createElement("strong");
          name.textContent = location.name || "Unnamed location";
          const status = document.createElement("span");
          const locationStatus = String(location.status || "planned").toLowerCase();
          status.className = "location-live-status" + (locationStatus === "active" ? " is-active" : locationStatus === "offline" ? " is-offline" : "");
          status.textContent = location.status || "planned";
          link.append(name, status);
          locationsList.appendChild(link);
        });
      }
    }
  }

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
      const openLink = document.createElement("a");
      openLink.className = "location-open-link";
      openLink.href = "#location-" + encodeURIComponent(location.id);
      openLink.textContent = "Open location →";
      details.appendChild(openLink);
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

  // Build a schematic, interactive room grid from the live public location and observation records.
  function renderCampusFloorplan() {
    const container = document.getElementById("campusFloorplan");
    if (!container) return;
    container.setAttribute("aria-busy", "false");
    container.innerHTML = "";

    const floors = [
      { label: "2nd Floor", rooms: ["202", "203", "204", "205", "420", "421"] },
      { label: "3rd Floor", rooms: ["301", "302", "303", "304", "305", "306", "307"] }
    ];

    const timestampOf = item => {
      const value = item && (item.timestamp || item.createdAt);
      const date = value && typeof value.toDate === "function" ? value.toDate() : new Date(value || 0);
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };
    const roomCodeOf = location => {
      const text = String(location.roomNumber || location.room || location.name || "");
      const match = text.match(/(?:^|[^0-9])(202|203|204|205|301|302|303|304|305|306|307|420|421)(?:[^0-9]|$)/);
      return match ? match[1] : null;
    };
    const latestForLocation = location => {
      const records = cachedObservations.filter(item => {
        const device = cachedDevices.find(entry => entry.id === item.deviceId);
        const recordLocationId = item.locationId || (device && device.locationId);
        return recordLocationId === location.id;
      }).sort((a, b) => timestampOf(b) - timestampOf(a));
      const real = records.find(item => item.isSimulated !== true);
      return { real, test: real ? null : records.find(item => item.isSimulated === true) };
    };

    floors.forEach(floor => {
      const section = document.createElement("section");
      section.className = "floorplan-floor";
      const heading = document.createElement("h3");
      heading.className = "floorplan-floor-title";
      heading.textContent = floor.label;
      section.appendChild(heading);
      const grid = document.createElement("div");
      grid.className = "floorplan-grid";
      floor.rooms.forEach(roomNumber => {
        const location = cachedLocations.find(item => roomCodeOf(item) === roomNumber);
        const card = document.createElement(location ? "a" : "article");
        const latest = location ? latestForLocation(location) : { real: null, test: null };
        const record = latest.real;
        const rawValue = record && (record.rawValue ?? record.rawAdc ?? record.raw_adc);
        const raw = rawValue === undefined || rawValue === null ? NaN : Number(rawValue);
        const valid = Number.isFinite(raw) && raw >= 0 && raw <= 1023;
        const level = !valid ? "no-reading" : raw < 500 ? "is-green" : raw <= 750 ? "is-amber" : "is-red";
        card.className = "floorplan-room " + level + (location ? "" : " is-unregistered");
        if (location) {
          card.href = "#location-" + encodeURIComponent(location.id);
          card.setAttribute("aria-label", "Room " + roomNumber + (valid ? ", raw ADC " + raw : ", no non-simulated reading"));
        } else {
          card.setAttribute("aria-label", "Room " + roomNumber + ", no sensor location registered");
        }
        const number = document.createElement("span");
        number.className = "floorplan-room-number";
        number.textContent = "ROOM";
        const name = document.createElement("strong");
        name.className = "floorplan-room-name";
        name.textContent = roomNumber;
        const reading = document.createElement("span");
        reading.className = "floorplan-room-reading";
        reading.textContent = valid ? raw + " ADC" : !location ? "No sensor registered" : latest.test ? "Test data only" : "No live reading";
        const status = document.createElement("span");
        status.className = "floorplan-room-status";
        status.textContent = valid ? (raw < 500 ? "LOW ACTIVITY" : raw <= 750 ? "ELEVATED" : "HIGH ACTIVITY") : !location ? "NOT CONNECTED" : latest.test ? "SIMULATED" : "AWAITING DATA";
        card.append(number, name, reading, status);
        if (record) {
          const time = document.createElement("small");
          time.className = "floorplan-room-time";
          time.textContent = "Updated " + formatAlertTime(record.timestamp || record.createdAt);
          card.appendChild(time);
        }
        grid.appendChild(card);
      });
      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  function locationReadingDate(item) {
    const value = item && (item.timestamp || item.createdAt);
    if (!value) return null;
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function makeLocationDetailSection(location) {
    const section = document.createElement("section");
    section.className = "page-content secondary-page location-detail-page";
    section.id = "location-" + location.id;

    const back = document.createElement("a");
    back.className = "text-link location-back-link";
    back.href = "#locations";
    back.textContent = "← All locations";
    section.appendChild(back);

    const eyebrow = document.createElement("div");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "LOCATION MONITORING";
    section.appendChild(eyebrow);

    const heading = document.createElement("h1");
    heading.textContent = location.name || "Unnamed location";
    section.appendChild(heading);

    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = location.description || "Location-specific sensor readings and monitoring history.";
    section.appendChild(intro);

    const rangeControls = document.createElement("div");
    rangeControls.className = "location-range-controls";
    const rangeLabel = document.createElement("label");
    rangeLabel.textContent = "History range";
    rangeLabel.htmlFor = "locationRange-" + location.id;
    const rangeSelect = document.createElement("select");
    rangeSelect.id = "locationRange-" + location.id;
    [["24","Last 24 hours"],["7","Last 7 days"],["30","Last 30 days"],["all","All loaded history"]].forEach(([value,label]) => {
      const option = document.createElement("option");
      option.value = value; option.textContent = label; rangeSelect.appendChild(option);
    });
    rangeSelect.value = locationHistoryRanges[location.id] || "all";
    rangeSelect.addEventListener("change", () => {
      locationHistoryRanges[location.id] = rangeSelect.value;
      renderLocationDetailPages();
    });
    rangeControls.append(rangeLabel,rangeSelect);
    section.appendChild(rangeControls);

    const devices = cachedDevices.filter(device => device.locationId === location.id);
    const observations = cachedObservations.filter(item => {
      if (item.locationId) return item.locationId === location.id;
      return devices.some(device => device.id === item.deviceId);
    }).sort((a,b) => (locationReadingDate(b)?.getTime() || 0) - (locationReadingDate(a)?.getTime() || 0));
    const selectedRange = locationHistoryRanges[location.id] || "all";
    const rangeCutoff = selectedRange === "all" ? 0 : Date.now() - Number(selectedRange) * 24 * 60 * 60 * 1000;
    const historyObservations = observations.filter(item => {
      const date = locationReadingDate(item);
      return date && date.getTime() >= rangeCutoff;
    });
    const historyAlerts = cachedAlerts.filter(alert => {
      const belongsToLocation = alert.locationId === location.id || (!alert.locationId && alert.classroomName === location.name);
      const date = locationReadingDate({timestamp: alert.createdAt});
      return belongsToLocation && date && date.getTime() >= rangeCutoff;
    }).sort((a,b) => (locationReadingDate({timestamp:b.createdAt})?.getTime() || 0) - (locationReadingDate({timestamp:a.createdAt})?.getTime() || 0));
    const latestByDevice = devices.map(device => ({
      device,
      latest: observations.find(item => item.deviceId === device.id) || null
    }));
    const latestObservation = observations[0] || null;
    const onlineDeviceCount = devices.filter(device => getDeviceHeartbeatState(device).online).length;
    const isRecent = onlineDeviceCount > 0;
    const summary = document.createElement("div");
    summary.className = "location-detail-summary";
    const summaryItems = [
      ["Location status", location.status || "planned"],
      ["Registered sensors", String(devices.length)],
      ["Sensor status", isRecent ? onlineDeviceCount + " online · heartbeat" : devices.length ? "Offline · no recent heartbeat" : "No sensor assigned"],
      ["Latest raw reading", latestObservation ? String(latestObservation.rawValue ?? latestObservation.rawAdc ?? latestObservation.raw_adc ?? "—") + " ADC" : "—"]
    ];
    summaryItems.forEach(([label,value]) => {
      const card = document.createElement("article");
      card.className = "location-detail-stat";
      const small = document.createElement("span"); small.textContent = label;
      const strong = document.createElement("strong"); strong.textContent = value;
      card.append(small,strong); summary.appendChild(card);
    });
    section.appendChild(summary);

    const statusNote = document.createElement("p");
    statusNote.className = "location-detail-note";
    statusNote.textContent = "Online means an authenticated server heartbeat was received within the last 2 minutes. Last reading time is shown separately. Raw ADC readings are not dB or dB(A).";
    section.appendChild(statusNote);

    const devicePanel = document.createElement("section");
    devicePanel.className = "panel location-detail-panel";
    const deviceHeading = document.createElement("div");
    deviceHeading.className = "panel-heading";
    const deviceTitle = document.createElement("div");
    const deviceH = document.createElement("h2"); deviceH.textContent = "Assigned sensors";
    const deviceP = document.createElement("p"); deviceP.textContent = "Devices registered at this monitoring location";
    deviceTitle.append(deviceH,deviceP); deviceHeading.appendChild(deviceTitle); devicePanel.appendChild(deviceHeading);
    if (!devices.length) {
      const empty = document.createElement("p"); empty.className = "dashboard-empty-text"; empty.textContent = "No sensors are assigned to this location yet."; devicePanel.appendChild(empty);
    } else {
      devices.forEach(device => {
        const row = document.createElement("div"); row.className = "location-detail-device";
        const name = document.createElement("strong"); name.textContent = device.deviceId || "Unnamed device";
        const status = document.createElement("span");
        const latest = latestByDevice.find(item => item.device.id === device.id)?.latest;
        const date = locationReadingDate(latest);
        const heartbeat = getDeviceHeartbeatState(device);
        status.className = "device-monitor-status " + (heartbeat.online ? "is-online" : "is-offline");
        status.textContent = heartbeat.label;
        row.append(name,status);
        const meta = document.createElement("small");
        const latestRaw = latest ? (latest.rawValue ?? latest.rawAdc ?? latest.raw_adc) : null;
        meta.textContent = (device.hardware || "Hardware not specified") + " · " + heartbeat.detail + " · Latest reading: " + (latestRaw === null || latestRaw === undefined ? "Not recorded" : latestRaw + " ADC") + " · " + (latest ? formatAlertTime(latest.timestamp || latest.createdAt) : "No timestamp");
        row.appendChild(meta); devicePanel.appendChild(row);
      });
    }
    section.appendChild(devicePanel);

    const historyPanel = document.createElement("section");
    historyPanel.className = "panel location-detail-panel";
    const historyHeading = document.createElement("div"); historyHeading.className = "panel-heading";
    const historyTitle = document.createElement("div");
    const historyH = document.createElement("h2"); historyH.textContent = "Historical readings";
    const historyP = document.createElement("p"); historyP.textContent = "Saved raw ADC observations for this location";
    historyTitle.append(historyH,historyP); historyHeading.appendChild(historyTitle); historyPanel.appendChild(historyHeading);
    const chartableObservations = historyObservations.filter(item => !item.isSimulated && Number.isFinite(Number(item.rawValue ?? item.rawAdc ?? item.raw_adc)));
    if (chartableObservations.length >= 2) {
      const chartWrap = document.createElement("div"); chartWrap.className = "location-history-chart";
      const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 600 180"); svg.setAttribute("role","img");
      svg.setAttribute("aria-label","Historical raw ADC readings for " + (location.name || "this location"));
      const valid = chartableObservations.slice(0,30).reverse();
      if (valid.length >= 2) {
        const values = valid.map(item => Number(item.rawValue ?? item.rawAdc ?? item.raw_adc));
        const min = Math.min(...values), max = Math.max(...values), range = Math.max(1,max-min);
        const points = values.map((value,index) => {
          const x = 24 + index * (552 / Math.max(1,values.length-1));
          const y = 150 - ((value-min)/range)*112;
          return x.toFixed(1)+","+y.toFixed(1);
        }).join(" ");
        const line = document.createElementNS("http://www.w3.org/2000/svg","polyline");
        line.setAttribute("points",points); line.setAttribute("fill","none");
        line.setAttribute("stroke","#16a899"); line.setAttribute("stroke-width","3");
        line.setAttribute("stroke-linecap","round"); line.setAttribute("stroke-linejoin","round");
        svg.appendChild(line);
        const minLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
        minLabel.setAttribute("x","24"); minLabel.setAttribute("y","34"); minLabel.textContent = "Min " + min + " ADC";
        const maxLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
        maxLabel.setAttribute("x","576"); maxLabel.setAttribute("y","16"); maxLabel.setAttribute("text-anchor","end"); maxLabel.textContent = "Max " + max + " ADC";
        svg.append(minLabel,maxLabel);
        const firstDate = locationReadingDate(valid[0]);
        const lastDate = locationReadingDate(valid[valid.length - 1]);
        const makeTimeLabel = date => date ? new Intl.DateTimeFormat("en-IN", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date) : "Time unavailable";
        const startLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
        startLabel.setAttribute("x","24"); startLabel.setAttribute("y","170"); startLabel.textContent = makeTimeLabel(firstDate);
        const endLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
        endLabel.setAttribute("x","576"); endLabel.setAttribute("y","170"); endLabel.setAttribute("text-anchor","end"); endLabel.textContent = makeTimeLabel(lastDate);
        svg.append(startLabel,endLabel);
      }
      chartWrap.appendChild(svg); historyPanel.appendChild(chartWrap);
      const chartNote = document.createElement("p"); chartNote.className = "location-detail-note";
      chartNote.textContent = "Chart uses up to 30 latest non-simulated saved readings. Simulated tests are labelled in the records below. Values are raw ADC, not calibrated sound levels.";
      historyPanel.appendChild(chartNote);
    } else {
      const empty = document.createElement("p"); empty.className = "dashboard-empty-text";
      empty.textContent = historyObservations.length ? "Add more non-simulated readings to display a trend graph." : "No readings recorded for this location in the selected time range.";
      historyPanel.appendChild(empty);
    }
    const tableWrap = document.createElement("div"); tableWrap.className = "location-history-table";
    if (historyObservations.length) {
      historyObservations.slice(0,20).forEach(item => {
        const row = document.createElement("div"); row.className = "location-history-row";
        const value = document.createElement("strong"); value.textContent = String(item.rawValue ?? item.rawAdc ?? item.raw_adc ?? "—") + " ADC";
        const date = document.createElement("span"); date.textContent = formatAlertTime(item.timestamp || item.createdAt);
        const device = devices.find(entry => entry.id === item.deviceId);
        const deviceLabel = document.createElement("small"); deviceLabel.textContent = (device ? device.deviceId : "Unlinked device") + (item.isSimulated ? " · SIMULATED" : "");
        row.append(value,date,deviceLabel); tableWrap.appendChild(row);
      });
    }
    historyPanel.appendChild(tableWrap);
    section.appendChild(historyPanel);

    const alertPanel = document.createElement("section");
    alertPanel.className = "panel location-detail-panel";
    const alertHeading = document.createElement("div"); alertHeading.className = "panel-heading";
    const alertTitle = document.createElement("div");
    const alertH = document.createElement("h2"); alertH.textContent = "Threshold exceedance history";
    const alertP = document.createElement("p"); alertP.textContent = "Alert events recorded for this location";
    alertTitle.append(alertH,alertP); alertHeading.appendChild(alertTitle); alertPanel.appendChild(alertHeading);
    if (!historyAlerts.length) {
      const empty = document.createElement("p"); empty.className = "dashboard-empty-text";
      empty.textContent = "No threshold alert records have been saved for this location in the selected time range.";
      alertPanel.appendChild(empty);
    } else {
      historyAlerts.slice(0,20).forEach(alert => {
        const row = document.createElement("div"); row.className = "location-history-row";
        const value = document.createElement("strong"); value.textContent = Number.isFinite(Number(alert.rawAdc)) ? alert.rawAdc + " ADC" : "Reading unavailable";
        const date = document.createElement("span"); date.textContent = formatAlertTime(alert.createdAt);
        const state = document.createElement("small"); state.textContent = (alert.status || "open").toUpperCase() + " · " + Number(alert.warningCount || 0) + " warnings" + (alert.source === "manual_test" ? " · TEST ALERT" : "");
        row.append(value,date,state); alertPanel.appendChild(row);
      });
    }
    const alertNote = document.createElement("p"); alertNote.className = "location-detail-note";
    alertNote.textContent = "This list reflects saved alert records. A numeric sound threshold is not displayed because the current LM393 prototype is not calibrated in dB(A).";
    alertPanel.appendChild(alertNote);
    section.appendChild(alertPanel);
    return section;
  }

  function renderLocationDetailPages() {
    const container = document.getElementById("locationDetailPages");
    if (!container) return;
    container.innerHTML = "";
    cachedLocations.forEach(location => container.appendChild(makeLocationDetailSection(location)));
  }

  function connectLocations() {
    if (!window.NoiseMap || !window.NoiseMap.configured || !locationList) return;
    if (locationStatus) locationStatus.textContent = "Loading locations from Firestore…";
    setLoadingTimeout(locationStatus, "Loading locations from Firestore…", "Locations could not be confirmed yet. Check your connection or Firestore permissions.");
    if (locationUnsubscribe) locationUnsubscribe();
    locationUnsubscribe = window.NoiseMap.subscribeLocations(locations => {
      cachedLocations = locations;
      updateAudioMonitorFromObservations(cachedObservations);
      populateAlertLocations(locations);
      populateLiveMonitoringLocations(locations);
      renderLiveMonitoring();
      populateRecordLocationSelects(locations);
      renderLocations(locations);
      renderLocationDetailPages();
      renderCampusFloorplan();
      renderDashboard();
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
    connectDevices();
    connectObservations();
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
      if (isEditor) {
        connectAlerts();
        connectActions();
      } else {
        if (window.NoiseAudio) window.NoiseAudio.resetAll();
        if (alertUnsubscribe) { alertUnsubscribe(); alertUnsubscribe = null; }
        if (actionUnsubscribe) { actionUnsubscribe(); actionUnsubscribe = null; }
        cachedAlerts = [];
        cachedActions = [];
        renderAlerts([]);
        renderActions([]);
      }
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
      if (alert.source === "web_audio_threshold") {
        detail.textContent = "Sustained raw ADC threshold event · " +
          Number(alert.triggerDurationSeconds || 5) + " seconds · trigger " +
          (Number.isFinite(Number(alert.thresholdAdc)) ? alert.thresholdAdc + " ADC" : "threshold unavailable") +
          " · latest " + (Number.isFinite(Number(alert.rawAdc)) ? alert.rawAdc + " ADC" : "reading unavailable") +
          " · browser monitor";
      } else {
        detail.textContent = "Noise remained high after " + Number(alert.warningCount || 3) + " warnings · Raw sensor reading: " +
          (Number.isFinite(Number(alert.rawAdc)) ? alert.rawAdc + " ADC" : "not recorded") +
          (alert.source === "manual_test" ? " · TEST ALERT" : "");
      }
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
    if (!canManageRecords || !window.NoiseMap || !window.NoiseMap.configured || !alertList) return;
    if (alertStatusLine) alertStatusLine.textContent = "Loading staffroom alerts…";
    setLoadingTimeout(alertStatusLine, "Loading staffroom alerts…", "Alerts are taking too long to load. Sign in with an authorised team account or check the connection.");
    if (alertUnsubscribe) alertUnsubscribe();
    alertUnsubscribe = window.NoiseMap.subscribeAlerts(alerts => {
      cachedAlerts = alerts;
      renderAlerts(alerts);
      renderLocationDetailPages();
      renderDashboard();
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
        if (alertTestMessage) alertTestMessage.textContent = "TEST ALERT created. No sensor event or Action Tracker record was generated.";
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
    ["observationDevice", "simulatorDevice"].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const previous = select.value;
      select.innerHTML = id === "simulatorDevice" ? '<option value="">Select a device</option>' : '<option value="">No device selected</option>';
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

  function getDeviceHeartbeatState(device, now = Date.now()) {
    if (device && String(device.connectionStatus || "").toLowerCase() === "planned") {
      return { online: false, label: "Planned", detail: "Device is registered but not activated yet" };
    }
    const value = device && device.lastHeartbeatAt;
    if (!value) {
      return { online: false, label: "Offline", detail: "No heartbeat received yet" };
    }
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { online: false, label: "Offline", detail: "Heartbeat timestamp unavailable" };
    }
    const ageMs = now - date.getTime();
    if (ageMs < 0) {
      return { online: false, label: "Offline", detail: "Heartbeat timestamp is in the future" };
    }
    if (ageMs <= NM_HEARTBEAT_TIMEOUT_MS) {
      return { online: true, label: "Online", detail: "Last heartbeat: " + formatAlertTime(value) };
    }
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageText = ageMinutes < 60 ? ageMinutes + " min ago" :
      Math.floor(ageMinutes / 60) + " hr ago";
    return { online: false, label: "Offline", detail: "Last heartbeat: " + ageText };
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

    devices.forEach(device => {
      const location = cachedLocations.find(item => item.id === device.locationId);
      const latest = cachedObservations.find(item => item.deviceId === device.id);
      const raw = latest ? (latest.rawValue ?? latest.rawAdc ?? latest.raw_adc) : null;
      const timeValue = latest && (latest.timestamp || latest.createdAt);
      const readingDate = timeValue
        ? (typeof timeValue.toDate === "function" ? timeValue.toDate() : new Date(timeValue))
        : null;
      const ageMs = readingDate && !Number.isNaN(readingDate.getTime()) ? now - readingDate.getTime() : Infinity;
      const heartbeat = getDeviceHeartbeatState(device, now);
      const isRecent = heartbeat.online;
      if (isRecent) recentCount++;

      if (monitorGrid) {
        const card = document.createElement("article");
        card.className = "device-monitor-card";
        const top = document.createElement("div");
        top.className = "device-monitor-card-top";
        const name = document.createElement("h3");
        name.textContent = device.deviceId || "Unnamed device";
        const status = document.createElement("span");
        status.className = "device-monitor-status " + (isRecent ? "is-online" : "is-offline");
        status.textContent = heartbeat.label;
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
        const heartbeatMeta = document.createElement("p");
        heartbeatMeta.className = "device-monitor-meta";
        heartbeatMeta.textContent = heartbeat.detail;
        const hardware = document.createElement("p");
        hardware.className = "device-monitor-meta";
        hardware.textContent = "Hardware: " + (device.hardware || "Not specified");
        card.append(top, reading, unit, locationText, lastSeen, heartbeatMeta, hardware);
        monitorGrid.appendChild(card);
      }

      list.appendChild(recordCard(
        device.deviceId || "Unnamed device",
        device.hardware || "Hardware not specified",
        "Location: " + (location ? location.name : "Not linked") + " · Connection: " + heartbeat.label + " · " + heartbeat.detail + " · Firestore document ID: " + device.id,
        "Device", device.id
      ));
    });

    if (totalEl) totalEl.textContent = String(devices.length);
    if (recentEl) recentEl.textContent = String(recentCount);
    if (waitingEl) waitingEl.textContent = String(devices.filter(device =>
      String(device.connectionStatus || "").toLowerCase() !== "planned"
    ).length - recentCount);
    if (noteEl) noteEl.textContent = devices.length
      ? "Online means an authenticated heartbeat reached Apps Script within the last 2 minutes. A missing or stale heartbeat is Offline. Last-reading time is shown separately. ADC values are raw readings, not dB/dB(A)."
      : "No devices are registered yet. Add a device below to begin tracking its connection status.";
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
        (observation.isSimulated ? "SIMULATED TEST · " : "") + "Recorded: " + formatAlertTime(dateValue),
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
      const automatic = action.source === "automatic_rule";
      const testAutomation = action.source === "manual_test_automation";
      const title = automatic
        ? "AUTOMATED RECOMMENDATION · " + (action.priority === "high" ? "HIGH PRIORITY" : "ACTION")
        : testAutomation
          ? "AUTOMATED TEST RECOMMENDATION · TEST ONLY"
          : "Action record";
      const description = action.recommendation || action.description || "Action record";
      const status = action.responseStatus || "not verified";
      const notification = automatic
        ? " · Notification: " + (action.notificationStatus === "in_app_alert_created" ? "In-app staff alert created; external delivery not configured" : "Not sent")
        : testAutomation
          ? " · Created automatically from a manual test alert; no external notification sent"
          : "";
      list.appendChild(recordCard(
        title,
        description + " · Responsible: " + (action.responsible || "Not assigned") + " · Status: " + status,
        "Action date: " + (action.actionDate || "Awaiting response") +
          (action.locationId ? " · Location: " + action.locationId : "") +
          (action.deviceId ? " · Device: " + action.deviceId : "") +
          notification +
          (action.evidenceUrl ? " · Evidence: " + action.evidenceUrl : ""),
        "Action", action.id
      ));
    });
  }

  // Re-evaluate heartbeat age even when Firestore has no new snapshot.
  window.setInterval(() => {
    renderDevices(cachedDevices);
    renderLocationDetailPages();
    renderCampusFloorplan();
    renderDashboard();
  }, 15000);

  function connectDevices() {
    if (!window.NoiseMap || !window.NoiseMap.configured) return;
    deviceUnsubscribe = window.NoiseMap.subscribeDevices(items => {
      cachedDevices = items;
      updateAudioMonitorFromObservations(cachedObservations);
      renderDevices(items);
      renderObservations(cachedObservations);
      renderLocationDetailPages();
      renderCampusFloorplan();
      renderDashboard();
    }, error => console.error("Could not load devices:", error));
  }

  function connectObservations() {
    if (!window.NoiseMap || !window.NoiseMap.configured) return;
    const connection = document.getElementById("liveMonitorConnection");
    observationsConnectionReady = false;
    if (connection) connection.textContent = "Connecting to Firestore…";
    setLoadingTimeout(connection, "Connecting to Firestore…", "Firestore connection timed out. Check your connection and database permissions.");
    observationUnsubscribe = window.NoiseMap.subscribeObservations(items => {
      observationsConnectionReady = true;
      cachedObservations = items;
      updateAudioMonitorFromObservations(items);
      renderObservations(items);
      renderDevices(cachedDevices);
      renderLocationDetailPages();
      renderCampusFloorplan();
      renderDashboard();
    }, error => {
      console.error("Could not load observations:", error);
      if (connection) connection.textContent = error.code === "permission-denied"
        ? "Firestore access denied. Check the observations read rule."
        : "Could not connect to Firestore. Check your connection and configuration.";
    });
  }

  function renderEndpointTests(items) {
    const list = document.getElementById("endpointTestList");
    const status = document.getElementById("endpointTestStatus");
    if (!list) return;
    list.innerHTML = "";
    if (!items.length) {
      if (status) status.textContent = "Connected. No endpoint test records were found in this collection yet.";
      const empty = document.createElement("p");
      empty.className = "dashboard-empty-text";
      empty.textContent = "No Apps Script endpoint test records yet.";
      list.appendChild(empty);
      return;
    }
    if (status) status.textContent = "Connected · " + items.length + " endpoint test record(s). These are not live sensor readings.";
    [...items].sort((a, b) => {
      const dateOf = value => value && typeof value.toDate === "function" ? value.toDate() : new Date(value || 0);
      return dateOf(b.createdAt || b.timestamp) - dateOf(a.createdAt || a.timestamp);
    }).forEach(item => {
      const card = document.createElement("article");
      card.className = "firestore-location-card";
      const details = document.createElement("div");
      details.className = "firestore-location-details";
      const heading = document.createElement("h3");
      heading.textContent = "Endpoint test · " + (item.status || "record received");
      const description = document.createElement("p");
      const raw = item.rawValue ?? item.rawAdc ?? item.raw_adc;
      description.textContent = "Source: " + (item.source || "Apps Script test") +
        " · Simulated: " + (item.isSimulated === true ? "Yes" : "Not marked") +
        (raw === undefined || raw === null ? "" : " · Raw value: " + raw + " ADC");
      const meta = document.createElement("p");
      meta.textContent = "Saved: " + formatAlertTime(item.createdAt || item.timestamp) + " · Document: " + item.id;
      details.append(heading, description, meta);
      const tag = document.createElement("span");
      tag.className = "firestore-location-status";
      tag.textContent = "TEST ONLY";
      card.append(details, tag);
      list.appendChild(card);
    });
  }

  function connectEndpointTests() {
    if (!canManageRecords || !window.NoiseMap || !window.NoiseMap.configured || endpointTestUnsubscribe) return;
    const status = document.getElementById("endpointTestStatus");
    if (status) status.textContent = "Loading endpoint test records…";
    endpointTestUnsubscribe = window.NoiseMap.subscribeEndpointTests(items => {
      cachedEndpointTests = items;
      renderEndpointTests(items);
    }, error => {
      console.error("Could not load endpoint test records:", error);
      if (status) status.textContent = error.code === "permission-denied"
        ? "Access denied. Confirm the endpoint_test_observations read rule and team membership."
        : "Could not load endpoint test records. Check the Firestore connection.";
    });
  }

  function connectActions() {
    if (!canManageRecords || !window.NoiseMap || !window.NoiseMap.configured) return;
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

  function setSimulatorStatus(message) {
    const status = document.getElementById("simulatorStatus");
    if (status) status.textContent = message;
  }

  async function createSimulatedReading() {
    if (!canManageRecords || !window.NoiseMap || !window.NoiseMap.configured) {
      stopSensorSimulator("Simulator unavailable. Check team sign-in and Firebase connection.");
      return;
    }
    const select = document.getElementById("simulatorDevice");
    const device = cachedDevices.find(item => item.id === (select && select.value));
    if (!device) {
      setSimulatorStatus("Select a registered device before generating readings.");
      return;
    }
    const rawValue = Math.floor(100 + Math.random() * 801);
    try {
      await window.NoiseMap.addObservation({
        deviceId: device.id, locationId: device.locationId || null, rawValue,
        measurementType: "raw_adc", unit: "ADC (0-1023)",
        source: "browser_simulator", isSimulated: true, simulatorSessionId
      });
      simulatorReadingCount++;
      setSimulatorStatus("Test reading " + simulatorReadingCount + " saved for " + (device.deviceId || "selected device") + ": " + rawValue + " ADC. This is simulated data.");
    } catch (error) {
      console.error("Could not save simulated reading:", error);
      setSimulatorStatus(error.code === "permission-denied"
        ? "Permission denied. Confirm team membership and Firestore observation write rules."
        : "Could not save test reading. Check Firebase connection and try again.");
      stopSensorSimulator();
    }
  }

  function stopSensorSimulator(message) {
    if (simulatorInterval) { clearInterval(simulatorInterval); simulatorInterval = null; }
    const start = document.getElementById("simulatorStart");
    const stop = document.getElementById("simulatorStop");
    if (start) start.disabled = false;
    if (stop) stop.disabled = true;
    if (message) setSimulatorStatus(message);
  }

  function startSensorSimulator() {
    if (!canManageRecords || simulatorInterval) return;
    const select = document.getElementById("simulatorDevice");
    if (!select || !cachedDevices.some(item => item.id === select.value)) {
      setSimulatorStatus("Please select a registered device first.");
      return;
    }
    simulatorSessionId = "sim_" + Date.now();
    simulatorReadingCount = 0;
    const start = document.getElementById("simulatorStart");
    const stop = document.getElementById("simulatorStop");
    if (start) start.disabled = true;
    if (stop) stop.disabled = false;
    setSimulatorStatus("Automatic test running. One simulated raw ADC reading will be saved every 5 seconds.");
    createSimulatedReading();
    simulatorInterval = setInterval(createSimulatedReading, 5000);
  }

  const simulatorOneButton = document.getElementById("simulatorOneReading");
  const simulatorStartButton = document.getElementById("simulatorStart");
  const simulatorStopButton = document.getElementById("simulatorStop");
  if (simulatorOneButton) simulatorOneButton.addEventListener("click", () => {
    if (!canManageRecords) return;
    simulatorSessionId = "sim_" + Date.now();
    simulatorReadingCount = 0;
    createSimulatedReading();
  });
  if (simulatorStartButton) simulatorStartButton.addEventListener("click", startSensorSimulator);
  if (simulatorStopButton) simulatorStopButton.addEventListener("click", () => stopSensorSimulator("Simulator stopped. Existing test readings remain saved in Historical Data."));

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
    const pageId = id.startsWith("location-") ? "locations" : id;
    if ((pageId === "alerts" || pageId === "actions") && !canManageRecords) {
      if (location.hash !== "#overview") location.hash = "#overview";
      return;
    }
    links.forEach(link => {
      const active = link.dataset.page === pageId;
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