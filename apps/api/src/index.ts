import { createClient, type Client } from "@libsql/client/web";
import { decodeProtectedHeader, importX509, jwtVerify, type JWTPayload, type KeyLike } from "jose";

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_EMAILS: string;
  ALLOWED_ORIGIN?: string;
}

interface AuthUser {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  allowed: boolean;
}

interface NoteRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

let keyCache: { expiresAt: number; keys: Map<string, KeyLike> } | null = null;

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env): Promise<Response> {
    return handleRequest(request, env);
  }
} satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const corsHeaders = buildCorsHeaders(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "isumi-playground-api" }, 200, corsHeaders);
    }

    const user = await authenticate(request, env);

    if (!user.allowed) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    const db = createDatabaseClient(env);
    await upsertUser(db, user);

    if (request.method === "GET" && url.pathname === "/me") {
      return json(user, 200, corsHeaders);
    }

    if (url.pathname === "/tools/notes") {
      if (request.method === "GET") {
        return json(await listNotes(db, user.uid), 200, corsHeaders);
      }

      if (request.method === "POST") {
        const payload = await readJson<{ title?: string; body?: string }>(request);
        const note = await createNote(db, user.uid, payload);
        return json(note, 201, corsHeaders);
      }
    }

    const noteMatch = url.pathname.match(/^\/tools\/notes\/([^/]+)$/);
    if (noteMatch) {
      const noteId = noteMatch[1];

      if (request.method === "PATCH") {
        const payload = await readJson<{ title?: string; body?: string }>(request);
        const note = await updateNote(db, user.uid, noteId, payload);
        return note
          ? json(note, 200, corsHeaders)
          : json({ error: "not_found" }, 404, corsHeaders);
      }

      if (request.method === "DELETE") {
        await deleteNote(db, user.uid, noteId);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    return json({ error: "not_found" }, 404, corsHeaders);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status, corsHeaders);
    }

    console.error(error);
    return json({ error: "internal_server_error" }, 500, corsHeaders);
  }
}

function createDatabaseClient(env: Env): Client {
  return createClient({
    url: requiredEnv(env.TURSO_URL, "TURSO_URL"),
    authToken: requiredEnv(env.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN")
  });
}

async function authenticate(request: Request, env: Env): Promise<AuthUser> {
  const header = request.headers.get("Authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw new HttpError(401, "missing_token");
  }

  const payload = await verifyFirebaseToken(token, env);
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";

  if (!email) {
    throw new HttpError(401, "missing_email");
  }

  return {
    uid: String(payload.sub),
    email,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
    allowed: isEmailAllowed(email, env.ALLOWED_EMAILS)
  };
}

async function verifyFirebaseToken(token: string, env: Env): Promise<JWTPayload> {
  const projectId = requiredEnv(env.FIREBASE_PROJECT_ID, "FIREBASE_PROJECT_ID");
  const { kid, alg } = decodeProtectedHeader(token);

  if (!kid || alg !== "RS256") {
    throw new HttpError(401, "invalid_token_header");
  }

  const key = await getFirebaseKey(kid);
  const { payload } = await jwtVerify(token, key, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  });

  if (!payload.sub) {
    throw new HttpError(401, "invalid_subject");
  }

  return payload;
}

async function getFirebaseKey(kid: string): Promise<KeyLike> {
  const now = Date.now();

  if (keyCache && keyCache.expiresAt > now && keyCache.keys.has(kid)) {
    return keyCache.keys.get(kid)!;
  }

  const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!response.ok) {
    throw new HttpError(503, "firebase_keys_unavailable");
  }

  const maxAge = response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1];
  const expiresAt = now + Number(maxAge || 3600) * 1000;
  const certificates = await response.json<Record<string, string>>();
  const keys = new Map<string, KeyLike>();

  for (const [certKid, certificate] of Object.entries(certificates)) {
    keys.set(certKid, await importX509(certificate, "RS256"));
  }

  keyCache = { expiresAt, keys };
  const key = keys.get(kid);

  if (!key) {
    throw new HttpError(401, "unknown_key");
  }

  return key;
}

function isEmailAllowed(email: string, allowedEmails: string): boolean {
  const allowlist = allowedEmails
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email);
}

async function upsertUser(db: Client, user: AuthUser): Promise<void> {
  await db.execute({
    sql: `
      INSERT INTO users (id, email, name, picture, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [user.uid, user.email, user.name, user.picture]
  });
}

async function listNotes(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT id, title, body, created_at, updated_at
      FROM tool_notes
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
    args: [userId]
  });

  return result.rows.map(mapNote);
}

async function createNote(db: Client, userId: string, payload: { title?: string; body?: string }) {
  const id = crypto.randomUUID();
  const title = sanitizeTitle(payload.title);
  const body = sanitizeBody(payload.body);

  await db.execute({
    sql: `
      INSERT INTO tool_notes (id, user_id, title, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [id, userId, title, body]
  });

  return findNote(db, userId, id);
}

async function updateNote(db: Client, userId: string, noteId: string, payload: { title?: string; body?: string }) {
  const updates: string[] = [];
  const args: Array<string> = [];

  if (payload.title !== undefined) {
    updates.push("title = ?");
    args.push(sanitizeTitle(payload.title));
  }

  if (payload.body !== undefined) {
    updates.push("body = ?");
    args.push(sanitizeBody(payload.body));
  }

  if (updates.length === 0) {
    return findNote(db, userId, noteId);
  }

  await db.execute({
    sql: `
      UPDATE tool_notes
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    args: [...args, noteId, userId]
  });

  return findNote(db, userId, noteId);
}

async function deleteNote(db: Client, userId: string, noteId: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM tool_notes WHERE id = ? AND user_id = ?",
    args: [noteId, userId]
  });
}

async function findNote(db: Client, userId: string, noteId: string) {
  const result = await db.execute({
    sql: `
      SELECT id, title, body, created_at, updated_at
      FROM tool_notes
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    args: [noteId, userId]
  });

  const row = result.rows[0] as unknown as NoteRow | undefined;
  return row ? mapNote(row) : null;
}

function mapNote(row: unknown) {
  const note = row as NoteRow;
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.created_at,
    updatedAt: note.updated_at
  };
}

function sanitizeTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : "";
  return (title || "Sem titulo").slice(0, 120);
}

function sanitizeBody(value: unknown): string {
  const body = typeof value === "string" ? value.trim() : "";
  return body.slice(0, 4000);
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set([
    "https://playground.isumi.com.br",
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    env.ALLOWED_ORIGIN
  ].filter(Boolean) as string[]);

  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function json(body: unknown, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  for (const [key, value] of Object.entries(jsonHeaders)) {
    responseHeaders.set(key, value);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders
  });
}

function requiredEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new HttpError(500, `${name}_not_configured`);
  }

  return value;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
