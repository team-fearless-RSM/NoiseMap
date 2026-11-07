/*
 * NoiseMap Firebase client bootstrap.
 * This is client-side configuration, NOT a service-account key.
 * Never place Admin SDK credentials or private keys in browser code.
 */
window.NOISEMAP_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB4lCjYfc6TDeBEXV6YmlYMot4Giyjjy9Q",
  authDomain: "noisemap-ead56.firebaseapp.com",
  projectId: "noisemap-ead56",
  storageBucket: "noisemap-ead56.firebasestorage.app",
  messagingSenderId: "48050644121",
  appId: "1:48050644121:web:fc1d3a4fd572edaf1e8408",
  measurementId: "G-QQMQ6P3FN8"
};

(function () {
  const config = window.NOISEMAP_FIREBASE_CONFIG || {};
  const configured = Boolean(config.apiKey && config.projectId && config.appId &&
    !String(config.apiKey).includes("REPLACE_"));

  if (!configured || !window.firebase) {
    window.NoiseMap = {
      configured: false, auth: null, db: null,
      signIn: async () => { throw new Error("Firebase is not configured yet. Add your Firebase Web App config first."); },
      signOut: async () => {},
      onAuthStateChanged: callback => { if (typeof callback === "function") callback(null); return () => {}; },
      addObservation: async () => { throw new Error("Firebase is not configured yet."); },
      subscribeAlerts: () => () => {}, addAlert: async () => { throw new Error("Firebase is not configured yet."); },
      updateAlertStatus: async () => { throw new Error("Firebase is not configured yet."); },
      deleteAlert: async () => { throw new Error("Firebase is not configured yet."); },
      addLocation: async () => { throw new Error("Firebase is not configured yet."); },
      deleteLocation: async () => { throw new Error("Firebase is not configured yet."); },
      addDevice: async () => { throw new Error("Firebase is not configured yet."); },
      deleteDevice: async () => { throw new Error("Firebase is not configured yet."); },
      subscribeDevices: () => () => {},
      addAction: async () => { throw new Error("Firebase is not configured yet."); },
      deleteAction: async () => { throw new Error("Firebase is not configured yet."); },
      subscribeActions: () => () => {},
      deleteObservation: async () => { throw new Error("Firebase is not configured yet."); },
      subscribeObservations: () => () => {},
      incrementVisitorCount: async () => { throw new Error("Firebase is not configured yet."); },
      subscribeVisitorCount: () => () => {}
    };
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(config);
  const auth = firebase.auth();
  const db = firebase.firestore();

  window.NoiseMap = {
    configured: true, auth, db,
    signIn: (email, password) => auth.signInWithEmailAndPassword(email.trim(), password),
    signOut: () => auth.signOut(),
    onAuthStateChanged: callback => auth.onAuthStateChanged(callback),
    isTeamMember: async uid => {
      if (!uid) return false;
      const member = await db.collection("teamMembers").doc(uid).get();
      return member.exists;
    },
    incrementVisitorCount: async () => {
      // Use India calendar dates so daily analytics follow the project's local timezone.
      const dateParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(new Date()).reduce((parts, item) => {
        if (item.type !== "literal") parts[item.type] = item.value;
        return parts;
      }, {});
      const dayId = "daily_" + dateParts.year + "-" + dateParts.month + "-" + dateParts.day;
      const increment = firebase.firestore.FieldValue.increment(1);
      const updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      // Both writes are atomic increments; public visitors do not need to read these documents.
      return Promise.all([
        db.collection("siteStats").doc("visitorCounter").set(
          { count: increment, updatedAt }, { merge: true }
        ),
        db.collection("siteStats").doc(dayId).set(
          { count: increment, updatedAt }, { merge: true }
        )
      ]);
    },
    subscribeVisitorCount: (onData, onError) => db.collection("siteStats").doc("visitorCounter")
      .onSnapshot(snapshot => onData(snapshot.exists ? Number(snapshot.data().count || 0) : 0), onError),
    subscribeVisitorAnalytics: (onData, onError) => db.collection("siteStats")
      .onSnapshot(snapshot => {
        const dailyCounts = {};
        snapshot.docs.forEach(doc => {
          if (/^daily_\d{4}-\d{2}-\d{2}$/.test(doc.id)) {
            dailyCounts[doc.id.slice(6)] = Number(doc.data().count || 0);
          }
        });
        onData(dailyCounts);
      }, onError),
    subscribeAlerts: (onData, onError) => db.collection("alerts").orderBy("createdAt", "desc").limit(100)
      .onSnapshot(snapshot => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), onError),
    addAlert: data => db.collection("alerts").add({
      locationId: data.locationId || null,
      classroomName: String(data.classroomName || "Unknown classroom").trim(),
      rawAdc: Number(data.rawAdc),
      warningCount: 3,
      status: "open",
      source: data.source || "manual_test",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid,
      source: data.source || "manual",
      isSimulated: Boolean(data.isSimulated),
      simulatorSessionId: data.simulatorSessionId || null
    }),
    updateAlertStatus: (alertId, status) => {
      if (!["acknowledged", "resolved"].includes(status)) throw new Error("Invalid alert status.");
      return db.collection("alerts").doc(alertId).update({
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser.uid
      });
    },
    deleteAlert: alertId => {
      if (!auth.currentUser) throw new Error("Sign in with an authorised team account first.");
      return db.collection("alerts").doc(alertId).delete();
    },
    subscribeLocations: (onData, onError) => db.collection("locations")
      .orderBy("name")
      .onSnapshot(snapshot => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), onError),
    deleteLocation: locationId => {
      if (!auth.currentUser) throw new Error("Sign in with an authorised team account first.");
      return db.collection("locations").doc(locationId).delete();
    },
    addLocation: data => db.collection("locations").add({
      name: String(data.name || "").trim(),
      description: String(data.description || "").trim(),
      status: data.status || "planned",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    }),
    subscribeDevices: (onData, onError) => db.collection("devices").orderBy("createdAt", "desc")
      .onSnapshot(snapshot => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), onError),
    deleteDevice: deviceId => {
      if (!auth.currentUser) throw new Error("Sign in with an authorised team account first.");
      return db.collection("devices").doc(deviceId).delete();
    },
    addDevice: data => db.collection("devices").add({
      deviceId: String(data.deviceId || "").trim(),
      locationId: data.locationId || null,
      hardware: data.hardware || "Arduino UNO + LM393",
      connectionStatus: data.connectionStatus || "offline",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    }),
    subscribeObservations: (onData, onError) => db.collection("observations").orderBy("timestamp", "desc").limit(300)
      .onSnapshot(snapshot => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), onError),
    deleteObservation: observationId => {
      if (!auth.currentUser) throw new Error("Sign in with an authorised team account first.");
      return db.collection("observations").doc(observationId).delete();
    },
    addObservation: data => db.collection("observations").add({
      deviceId: data.deviceId || null,
      locationId: data.locationId || null,
      timestamp: data.timestamp || firebase.firestore.FieldValue.serverTimestamp(),
      rawValue: Number(data.rawValue),
      measurementType: data.measurementType || "raw_adc",
      unit: data.unit || "ADC (0-1023)",
      calibration: data.calibration || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    }),
    subscribeActions: (onData, onError) => db.collection("actions").orderBy("createdAt", "desc").limit(300)
      .onSnapshot(snapshot => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), onError),
    deleteAction: actionId => {
      if (!auth.currentUser) throw new Error("Sign in with an authorised team account first.");
      return db.collection("actions").doc(actionId).delete();
    },
    addAction: data => db.collection("actions").add({
      observationId: data.observationId || null,
      description: String(data.description || "").trim(),
      actionDate: data.actionDate || null,
      responsible: data.responsible || "",
      responseStatus: data.responseStatus || "not_verified",
      evidenceUrl: data.evidenceUrl || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    })
  };
})();
