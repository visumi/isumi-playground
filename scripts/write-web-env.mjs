import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadDotEnv } from "./load-env.mjs";
import packageJson from "../package.json" with { type: "json" };

loadDotEnv();

const target = resolve("apps/web/src/environments/environment.ts");
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "";
const firebaseAuthDomain = process.env.FIREBASE_AUTH_DOMAIN || (firebaseProjectId ? `${firebaseProjectId}.firebaseapp.com` : "");
const env = {
  production: process.env.NODE_ENV === "production",
  appVersion: packageJson.version,
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8787",
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: firebaseAuthDomain,
    projectId: firebaseProjectId,
    appId: process.env.FIREBASE_APP_ID || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || ""
  }
};

if (env.production) {
  const missingFirebaseKeys = Object.entries(env.firebase)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingFirebaseKeys.length > 0) {
    throw new Error(`Missing Firebase production config: ${missingFirebaseKeys.join(", ")}`);
  }
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  `export const environment = ${JSON.stringify(env, null, 2)} as const;\n`
);
