/*
 * NoiseMap Firebase client bootstrap.
 * Replace every placeholder below with the Firebase Web App config from:
 * Firebase Console > Project settings > Your apps > SDK setup.
 * This is client-side configuration, NOT a service-account key.
 * Never place Admin SDK credentials or private keys in browser code.
 */
window.NOISEMAP_FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_FIREBASE_WEB_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_WEB_APP_ID"
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
      addObservation: async () => { throw new Error("Firebase is not configured yet."); },
      addLocation: async () => { throw new Error("Firebase is not configured yet."); },
      addDevice: async () => { throw new Error("Firebase is not configured yet."); },
      addAction: async () => { throw new Error("Firebase is not configured yet."); }
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
