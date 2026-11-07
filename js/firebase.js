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
      addLocation: async () => { throw new Error("Firebase is not configured yet."); },
      deleteLocation: async () => { throw new Error("Firebase is not configured yet."); },
      addDevice: async () => { throw new Error("Firebase is not configured yet."); },
      addAction: async () => { throw new Error("Firebase is not configured yet."); },
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
      const ref = db.collection("siteStats").doc("visitorCounter");
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          transaction.set(ref, { count: 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          return 1;
        }
        const nextCount = Number(snapshot.data().count || 0) + 1;
        transaction.update(ref, { count: nextCount, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        return nextCount;
      });
    },
    subscribeVisitorCount: (onData, onError) => db.collection("siteStats").doc("visitorCounter")
      .onSnapshot(snapshot => onData(snapshot.exists ? Number(snapshot.data().count || 0) : 0), onError),
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
      createdBy: auth.currentUser.uid
    }),
    updateAlertStatus: (alertId, status) => {
      if (!["acknowledged", "resolved"].includes(status)) throw new Error("Invalid alert status.");
      return db.collection("alerts").doc(alertId).update({
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser.uid
      });
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
    addDevice: data => db.collection("devices").add({
      deviceId: String(data.deviceId || "").trim(),
      locationId: data.locationId || null,
      hardware: data.hardware || "Arduino UNO + LM393",
      connectionStatus: data.connectionStatus || "offline",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    }),
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
