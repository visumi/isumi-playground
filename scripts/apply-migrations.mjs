import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDotEnv } from "./load-env.mjs";

loadDotEnv();

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error("TURSO_URL and TURSO_AUTH_TOKEN are required to apply migrations.");
}

const client = createClient({ url, authToken });
const migrationsDir = resolve("db/migrations");
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  console.log(`Applied ${file}`);
}
