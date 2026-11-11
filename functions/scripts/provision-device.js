#!/usr/bin/env node
/**
 * Provision or rotate one NoiseMap device credential.
 *
 * Run locally with Firebase Application Default Credentials:
 *   gcloud auth application-default login
 *   GOOGLE_CLOUD_PROJECT=noisemap-ead56 node scripts/provision-device.js NM-CLASS-01
 *
 * To rotate an existing credential, add --rotate.
 * The raw token is printed once only after the hash has been saved to Firestore.
 */
const crypto = require("node:crypto");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

async function main() {
  const args = process.argv.slice(2);
  const rotate = args.includes("--rotate");
  const deviceId = args.find(arg => arg !== "--rotate");
  if (!deviceId || !/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)) {
    throw new Error("Usage: node scripts/provision-device.js <DEVICE_ID> [--rotate]");
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "noisemap-ead56";
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();

  const deviceQuery = await db.collection("devices").where("deviceId", "==", deviceId).limit(2).get();
  if (deviceQuery.size !== 1) {
    throw new Error("Expected exactly one registered device with deviceId " + deviceId + "; found " + deviceQuery.size);
  }

  const secretRef = db.collection("deviceSecrets").doc(deviceId);
  const existing = await secretRef.get();
  if (existing.exists && !rotate) {
    throw new Error("A credential already exists. Re-run with --rotate only if you intend to invalidate the old token.");
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = FieldValue.serverTimestamp();
  await secretRef.set({
    tokenHash,
    updatedAt: now,
    ...(existing.exists ? { rotatedAt: now } : { createdAt: now })
  }, { merge: true });

  console.log("\nDevice credential saved for " + deviceId + ".");
  console.log("Copy this token now into NOISEMAP_DEVICE_TOKEN on the bridge computer.");
  console.log("It will not be shown again. Do not commit it or send it in chat.\n");
  console.log(token);
}

main().catch(error => {
  console.error("Provisioning failed:", error.message);
  process.exitCode = 1;
});
