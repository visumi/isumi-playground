import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadDotEnv } from "./load-env.mjs";

loadDotEnv();

const target = resolve("apps/web/src/environments/environment.ts");
const env = {
  production: process.env.NODE_ENV === "production",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8787",
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || ""
  }
};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  `export const environment = ${JSON.stringify(env, null, 2)} as const;\n`
);
