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

await client.execute(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

for (const file of files) {
  const applied = await client.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1",
    args: [file]
  });
  if (applied.rows.length > 0) continue;

  const sql = readFileSync(join(migrationsDir, file), "utf8");
  await client.executeMultiple(sql);
  await client.execute({
    sql: "INSERT INTO schema_migrations (filename) VALUES (?)",
    args: [file]
  });

  console.log(`Applied ${file}`);
}

await seedAccessGrants();

async function seedAccessGrants() {
  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);

  if (!ownerEmail) {
    console.warn("OWNER_EMAIL was not configured; access_grants owner seed was skipped.");
    return;
  }

  await client.execute({
    sql: `
      INSERT INTO access_grants (email, role, active, created_at, updated_at)
      VALUES (?, 'owner', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        role = 'owner',
        active = 1,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [ownerEmail]
  });

  const migratedEmails = parseEmailList(process.env.ALLOWED_EMAILS)
    .filter((email) => email !== ownerEmail);

  for (const email of migratedEmails) {
    await client.execute({
      sql: `
        INSERT INTO access_grants (email, role, active, created_at, updated_at)
        VALUES (?, 'member', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET
          active = 1,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [email]
    });
  }

  console.log(`Seeded access grants for ${1 + migratedEmails.length} email(s).`);
}

function parseEmailList(value) {
  return [...new Set((value || "")
    .split(/[,\r\n\t ;]+/)
    .map(normalizeEmail)
    .filter(Boolean))];
}

function normalizeEmail(value) {
  return (value || "").trim().toLowerCase();
}
