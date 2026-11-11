(function () {
  "use strict";
  const rooms = [
    { id: "101", name: "Classroom 101", device: "NM-ROOM-101", value: 320, history: [] },
    { id: "102", name: "Classroom 102", device: "NM-ROOM-102", value: 560, history: [] },
    { id: "103", name: "Staffroom", device: "NM-STAFF-01", value: 735, history: [] },
    { id: "104", name: "Classroom 104", device: "NM-ROOM-104", value: 245, history: [] }
  ];
  const records = [], incidents = [];
  let running = true, timer = null, pendingSpike = false;
  const $ = id => document.getElementById(id);
  const time = () => new Date().toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const band = value => value >= 751 ? "high" : value >= 500 ? "elevated" : "low";
  const label = value => band(value).toUpperCase();
  function renderRooms() {
    const grid = $("simRoomGrid");
    if (!grid) return;
    grid.innerHTML = rooms.map(room => {
      const level = band(room.value);
      const color = level === "high" ? "#d65b5b" : level === "elevated" ? "#d49a35" : "#159b8d";
      return '<article class="simulation-room-card"><div class="simulation-room-top"><div><div class="simulation-room-name">' + room.name + '</div><div class="simulation-room-id">' + room.device + '</div></div><span class="simulation-status-pill ' + level + '">' + label(room.value) + '</span></div><div class="simulation-room-value">' + room.value + '<small> ADC</small></div><div class="simulation-meter"><span style="width:' + (room.value / 10.23) + '%;background:' + color + '"></span></div><div class="simulation-room-meta"><span>Example bands: 0–499 / 500–750 / 751+</span><span>SIMULATED</span></div></article>';
    }).join("");
    $("simRoomCount").textContent = rooms.length;
    $("simOnlineCount").textContent = rooms.length;
    $("simAttentionCount").textContent = rooms.filter(room => room.value >= 500).length;
    $("simAlertCount").textContent = incidents.filter(item => !item.resolved).length;
  }
  function renderIncidents() {
    const feed = $("simIncidentFeed");
    if (!feed) return;
    feed.innerHTML = incidents.length ? incidents.slice(0,8).map(item => '<article class="simulation-feed-item"><strong>' + item.room + ' · ' + item.kind + '</strong><p>Simulated reading: ' + item.value + ' ADC. This is a demo event only.</p><small>' + item.time + ' · NO EMAIL SENT</small></article>').join("") : '<p class="dashboard-empty-text">No demo incidents yet. Use “Simulate spike” to create one.</p>';
    $("simAlertCount").textContent = incidents.filter(item => !item.resolved).length;
  }
  function renderRecords() {
    const body = $("simObservationRows");
    if (!body) return;
    body.innerHTML = records.slice(0,12).map(item => '<tr><td>' + item.time + '</td><td>' + item.room + '</td><td>' + item.device + '</td><td>' + item.value + '</td><td><span class="simulation-status-pill ' + band(item.value) + '">' + label(item.value) + '</span></td><td>Browser simulation</td></tr>').join("") || '<tr><td colspan="6">Waiting for first simulated update…</td></tr>';
  }
  function renderChart() {
    const target = $("simTrendChart");
    if (!target) return;
    const W=640,H=205,L=38,R=10,T=12,B=25,iw=W-L-R,ih=H-T-B;
    let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Simulated raw ADC trend">';
    [0,250,500,750,1000].forEach(v=>{const y=T+ih-(v/1023)*ih;svg+='<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="#e6edf0"/><text x="3" y="'+(y+3)+'" fill="#91a0aa" font-size="10">'+v+'</text>';});
    rooms.slice(0,2).forEach((room,index)=>{const values=room.history.slice(-20);if(values.length<2)return;const pts=values.map((v,i)=>(L+i*iw/19)+','+(T+ih-(v/1023)*ih)).join(' ');svg+='<polyline points="'+pts+'" fill="none" stroke="'+(index===0?'#159b8d':'#5788c8')+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';});
    svg+='<text x="'+L+'" y="'+(H-5)+'" fill="#91a0aa" font-size="10">Earlier</text><text x="'+(W-R)+'" y="'+(H-5)+'" text-anchor="end" fill="#91a0aa" font-size="10">Latest</text></svg>';
    target.innerHTML=svg;
  }
  function update() {
    rooms.forEach(room => {
      room.value = Math.max(80, Math.min(950, room.value + Math.round((Math.random()-.5)*100)));
      if (pendingSpike && room.id === "103") { room.value = 850; incidents.unshift({room:room.name,value:room.value,time:time(),kind:"Threshold spike"}); pendingSpike=false; }
      room.history.push(room.value);
      if (room.history.length>30) room.history.shift();
      records.unshift({time:time(),room:room.name,device:room.device,value:room.value});
    });
    if(records.length>80) records.length=80;
    renderRooms();renderIncidents();renderRecords();renderChart();
    $("simRunStatus").textContent=(running?"Simulation running":"Simulation paused")+" · last local update "+time();
  }
  $("simPauseBtn").addEventListener("click",function(){
    running=!running;this.textContent=running?"Pause":"Resume";
    $("simRunStatus").textContent=running?"Simulation running · updates every 3 seconds":"Simulation paused · no new readings";
    $("simRunStatus").classList.toggle("is-paused",!running);
    if(running){update();timer=setInterval(update,3000);}else{clearInterval(timer);timer=null;}
  });
  $("simSpikeBtn").addEventListener("click",function(){pendingSpike=true;if(!running){running=true;$("simPauseBtn").textContent="Pause";timer=setInterval(update,3000);}update();});
  $("simResetBtn").addEventListener("click",function(){
    [320,560,735,245].forEach((value,index)=>{rooms[index].value=value;rooms[index].history=[];});
    records.length=0;incidents.length=0;pendingSpike=false;renderRooms();renderIncidents();renderRecords();renderChart();
    $("simRunStatus").textContent="Demo reset · "+time();
  });
  rooms.forEach(room=>{for(let i=0;i<20;i++)room.history.push(Math.max(80,Math.min(950,room.value+Math.round((Math.random()-.5)*150))));});
  update();timer=setInterval(update,3000);
})();