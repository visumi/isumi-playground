import { createClient, type Client } from "@libsql/client/web";
import { decodeProtectedHeader, importX509, jwtVerify, type JWTPayload } from "jose";

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

interface ExpenseRoomRow {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ExpenseParticipantRow {
  id: string;
  room_id: string;
  user_id: string | null;
  name: string;
  kind: "user" | "guest";
  role: "owner" | "member" | "guest";
  created_at: string;
  updated_at: string;
}

interface ExpenseItemRow {
  id: string;
  room_id: string;
  payer_participant_id: string;
  description: string;
  amount_cents: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

interface ExpenseSplitRow {
  item_id: string;
  participant_id: string;
  share_units: number;
}

interface ExpenseItemSplitInput {
  participantId?: string;
  shareUnits?: number;
}

interface ExpenseItemInput {
  description?: string;
  amountCents?: number;
  payerParticipantId?: string;
  splits?: ExpenseItemSplitInput[];
}

interface ExpenseParticipantInput {
  name?: string;
}

interface CalculatedSplit {
  participantId: string;
  shareUnits: number;
  amountCents: number;
}

interface Settlement {
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
}

type FirebaseKey = Awaited<ReturnType<typeof importX509>>;

let keyCache: { expiresAt: number; keys: Map<string, FirebaseKey> } | null = null;

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

    if (url.pathname === "/tools/expenses/rooms") {
      if (request.method === "GET") {
        return json(await listExpenseRooms(db, user.uid), 200, corsHeaders);
      }

      if (request.method === "POST") {
        const payload = await readJson<{ name?: string }>(request);
        const room = await createExpenseRoom(db, user, payload);
        return json(room, 201, corsHeaders);
      }
    }

    const expenseRoomMatch = url.pathname.match(/^\/tools\/expenses\/rooms\/([^/]+)$/);
    if (expenseRoomMatch) {
      const roomId = expenseRoomMatch[1];

      if (request.method === "GET") {
        return json(await getExpenseRoomDetail(db, user, roomId), 200, corsHeaders);
      }

      if (request.method === "PATCH") {
        const payload = await readJson<{ name?: string }>(request);
        return json(await updateExpenseRoom(db, user.uid, roomId, payload), 200, corsHeaders);
      }
    }

    const expenseParticipantMatch = url.pathname.match(/^\/tools\/expenses\/rooms\/([^/]+)\/participants(?:\/([^/]+))?$/);
    if (expenseParticipantMatch) {
      const roomId = expenseParticipantMatch[1];
      const participantId = expenseParticipantMatch[2];

      if (request.method === "POST" && !participantId) {
        const payload = await readJson<ExpenseParticipantInput>(request);
        return json(await createGuestParticipant(db, user.uid, roomId, payload), 201, corsHeaders);
      }

      if (request.method === "PATCH" && participantId) {
        const payload = await readJson<ExpenseParticipantInput>(request);
        return json(await updateGuestParticipant(db, user.uid, roomId, participantId, payload), 200, corsHeaders);
      }

      if (request.method === "DELETE" && participantId) {
        await deleteGuestParticipant(db, user.uid, roomId, participantId);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    const expenseItemMatch = url.pathname.match(/^\/tools\/expenses\/rooms\/([^/]+)\/items(?:\/([^/]+))?$/);
    if (expenseItemMatch) {
      const roomId = expenseItemMatch[1];
      const itemId = expenseItemMatch[2];

      if (request.method === "POST" && !itemId) {
        const payload = await readJson<ExpenseItemInput>(request);
        return json(await createExpenseItem(db, user.uid, roomId, payload), 201, corsHeaders);
      }

      if (request.method === "PATCH" && itemId) {
        const payload = await readJson<ExpenseItemInput>(request);
        return json(await updateExpenseItem(db, user.uid, roomId, itemId, payload), 200, corsHeaders);
      }

      if (request.method === "DELETE" && itemId) {
        await deleteExpenseItem(db, user.uid, roomId, itemId);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
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
  const email = typeof payload["email"] === "string" ? payload["email"].toLowerCase() : "";

  if (!email) {
    throw new HttpError(401, "missing_email");
  }

  return {
    uid: String(payload.sub),
    email,
    name: typeof payload["name"] === "string" ? payload["name"] : null,
    picture: typeof payload["picture"] === "string" ? payload["picture"] : null,
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

async function getFirebaseKey(kid: string): Promise<FirebaseKey> {
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
  const keys = new Map<string, FirebaseKey>();

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

async function listExpenseRooms(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT r.id, r.owner_user_id, r.name, r.created_at, r.updated_at
      FROM expense_rooms r
      INNER JOIN expense_participants p ON p.room_id = r.id
      WHERE p.user_id = ?
      ORDER BY r.updated_at DESC
    `,
    args: [userId]
  });

  return (result.rows as unknown as ExpenseRoomRow[]).map(mapExpenseRoom);
}

async function createExpenseRoom(db: Client, user: AuthUser, payload: { name?: string }) {
  const roomId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const name = sanitizeRoomName(payload.name);
  const participantName = sanitizeParticipantName(user.name || user.email);

  await db.execute({
    sql: `
      INSERT INTO expense_rooms (id, owner_user_id, name, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [roomId, user.uid, name]
  });

  await db.execute({
    sql: `
      INSERT INTO expense_participants (id, room_id, user_id, name, kind, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [participantId, roomId, user.uid, participantName]
  });

  return buildExpenseRoomDetail(db, roomId);
}

async function getExpenseRoomDetail(db: Client, user: AuthUser, roomId: string) {
  const room = await findExpenseRoom(db, roomId);
  if (!room) {
    throw new HttpError(404, "not_found");
  }

  await ensureUserParticipant(db, room, user);
  return buildExpenseRoomDetail(db, roomId);
}

async function updateExpenseRoom(db: Client, userId: string, roomId: string, payload: { name?: string }) {
  await assertExpenseRoomOwner(db, roomId, userId);

  await db.execute({
    sql: `
      UPDATE expense_rooms
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [sanitizeRoomName(payload.name), roomId]
  });

  return buildExpenseRoomDetail(db, roomId);
}

async function createGuestParticipant(db: Client, userId: string, roomId: string, payload: ExpenseParticipantInput) {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participantId = crypto.randomUUID();

  await db.execute({
    sql: `
      INSERT INTO expense_participants (id, room_id, user_id, name, kind, role, created_at, updated_at)
      VALUES (?, ?, NULL, ?, 'guest', 'guest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [participantId, roomId, sanitizeParticipantName(payload.name)]
  });
  await touchExpenseRoom(db, roomId);

  return buildExpenseRoomDetail(db, roomId);
}

async function updateGuestParticipant(db: Client, userId: string, roomId: string, participantId: string, payload: ExpenseParticipantInput) {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participant = await findExpenseParticipant(db, roomId, participantId);

  if (!participant) {
    throw new HttpError(404, "not_found");
  }

  if (participant.kind !== "guest") {
    throw new HttpError(403, "cannot_edit_user_participant");
  }

  await db.execute({
    sql: `
      UPDATE expense_participants
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ?
    `,
    args: [sanitizeParticipantName(payload.name), participantId, roomId]
  });
  await touchExpenseRoom(db, roomId);

  return buildExpenseRoomDetail(db, roomId);
}

async function deleteGuestParticipant(db: Client, userId: string, roomId: string, participantId: string): Promise<void> {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participant = await findExpenseParticipant(db, roomId, participantId);

  if (!participant) {
    throw new HttpError(404, "not_found");
  }

  if (participant.kind !== "guest") {
    throw new HttpError(403, "cannot_delete_user_participant");
  }

  const payerResult = await db.execute({
    sql: "SELECT COUNT(*) AS count FROM expense_items WHERE room_id = ? AND payer_participant_id = ?",
    args: [roomId, participantId]
  });
  const payerCount = Number((payerResult.rows[0] as { count?: number | string } | undefined)?.count || 0);

  if (payerCount > 0) {
    throw new HttpError(409, "participant_pays_items");
  }

  await db.execute({
    sql: "DELETE FROM expense_participants WHERE id = ? AND room_id = ?",
    args: [participantId, roomId]
  });
  await touchExpenseRoom(db, roomId);
}

async function createExpenseItem(db: Client, userId: string, roomId: string, payload: ExpenseItemInput) {
  await assertExpenseRoomMember(db, roomId, userId);
  const itemId = crypto.randomUUID();
  const item = await sanitizeExpenseItemInput(db, roomId, payload);

  await db.execute({
    sql: `
      INSERT INTO expense_items (id, room_id, payer_participant_id, description, amount_cents, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [itemId, roomId, item.payerParticipantId, item.description, item.amountCents, userId]
  });
  await replaceExpenseItemSplits(db, itemId, item.splits);
  await touchExpenseRoom(db, roomId);

  return buildExpenseRoomDetail(db, roomId);
}

async function updateExpenseItem(db: Client, userId: string, roomId: string, itemId: string, payload: ExpenseItemInput) {
  await assertExpenseRoomMember(db, roomId, userId);
  await assertExpenseItemExists(db, roomId, itemId);
  const item = await sanitizeExpenseItemInput(db, roomId, payload);

  await db.execute({
    sql: `
      UPDATE expense_items
      SET payer_participant_id = ?, description = ?, amount_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ?
    `,
    args: [item.payerParticipantId, item.description, item.amountCents, itemId, roomId]
  });
  await replaceExpenseItemSplits(db, itemId, item.splits);
  await touchExpenseRoom(db, roomId);

  return buildExpenseRoomDetail(db, roomId);
}

async function deleteExpenseItem(db: Client, userId: string, roomId: string, itemId: string): Promise<void> {
  await assertExpenseRoomMember(db, roomId, userId);

  await db.execute({
    sql: "DELETE FROM expense_items WHERE id = ? AND room_id = ?",
    args: [itemId, roomId]
  });
  await touchExpenseRoom(db, roomId);
}

async function buildExpenseRoomDetail(db: Client, roomId: string) {
  const room = await findExpenseRoom(db, roomId);
  if (!room) {
    throw new HttpError(404, "not_found");
  }

  const participants = await listExpenseParticipants(db, roomId);
  const items = await listExpenseItems(db, roomId);
  const splits = await listExpenseSplits(db, roomId);
  const splitsByItem = groupSplitsByItem(splits);
  const detailedItems = items.map((item) => {
    const calculatedSplits = calculateItemSplits(
      item.amount_cents,
      (splitsByItem.get(item.id) || []).map((split) => ({
        participantId: split.participant_id,
        shareUnits: split.share_units
      }))
    );

    return mapExpenseItem(item, calculatedSplits);
  });
  const balances = calculateBalances(participants.map((participant) => participant.id), detailedItems);

  return {
    room: mapExpenseRoom(room),
    participants: participants.map(mapExpenseParticipant),
    items: detailedItems,
    balances,
    settlements: optimizeSettlements(balances)
  };
}

async function findExpenseRoom(db: Client, roomId: string): Promise<ExpenseRoomRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, owner_user_id, name, created_at, updated_at
      FROM expense_rooms
      WHERE id = ?
      LIMIT 1
    `,
    args: [roomId]
  });

  return (result.rows[0] as unknown as ExpenseRoomRow | undefined) || null;
}

async function ensureUserParticipant(db: Client, room: ExpenseRoomRow, user: AuthUser): Promise<void> {
  const existing = await db.execute({
    sql: "SELECT id FROM expense_participants WHERE room_id = ? AND user_id = ? LIMIT 1",
    args: [room.id, user.uid]
  });

  if (existing.rows.length > 0) {
    return;
  }

  await db.execute({
    sql: `
      INSERT INTO expense_participants (id, room_id, user_id, name, kind, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [
      crypto.randomUUID(),
      room.id,
      user.uid,
      sanitizeParticipantName(user.name || user.email),
      room.owner_user_id === user.uid ? "owner" : "member"
    ]
  });
  await touchExpenseRoom(db, room.id);
}

async function assertExpenseRoomOwner(db: Client, roomId: string, userId: string): Promise<void> {
  const room = await findExpenseRoom(db, roomId);

  if (!room) {
    throw new HttpError(404, "not_found");
  }

  if (room.owner_user_id !== userId) {
    throw new HttpError(403, "owner_required");
  }
}

async function assertExpenseRoomMember(db: Client, roomId: string, userId: string): Promise<void> {
  const result = await db.execute({
    sql: "SELECT id FROM expense_participants WHERE room_id = ? AND user_id = ? LIMIT 1",
    args: [roomId, userId]
  });

  if (result.rows.length === 0) {
    throw new HttpError(403, "member_required");
  }
}

async function assertExpenseItemExists(db: Client, roomId: string, itemId: string): Promise<void> {
  const result = await db.execute({
    sql: "SELECT id FROM expense_items WHERE id = ? AND room_id = ? LIMIT 1",
    args: [itemId, roomId]
  });

  if (result.rows.length === 0) {
    throw new HttpError(404, "not_found");
  }
}

async function findExpenseParticipant(db: Client, roomId: string, participantId: string): Promise<ExpenseParticipantRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, room_id, user_id, name, kind, role, created_at, updated_at
      FROM expense_participants
      WHERE id = ? AND room_id = ?
      LIMIT 1
    `,
    args: [participantId, roomId]
  });

  return (result.rows[0] as unknown as ExpenseParticipantRow | undefined) || null;
}

async function listExpenseParticipants(db: Client, roomId: string): Promise<ExpenseParticipantRow[]> {
  const result = await db.execute({
    sql: `
      SELECT id, room_id, user_id, name, kind, role, created_at, updated_at
      FROM expense_participants
      WHERE room_id = ?
      ORDER BY kind DESC, created_at ASC
    `,
    args: [roomId]
  });

  return result.rows as unknown as ExpenseParticipantRow[];
}

async function listExpenseItems(db: Client, roomId: string): Promise<ExpenseItemRow[]> {
  const result = await db.execute({
    sql: `
      SELECT id, room_id, payer_participant_id, description, amount_cents, created_by_user_id, created_at, updated_at
      FROM expense_items
      WHERE room_id = ?
      ORDER BY created_at DESC
    `,
    args: [roomId]
  });

  return result.rows as unknown as ExpenseItemRow[];
}

async function listExpenseSplits(db: Client, roomId: string): Promise<ExpenseSplitRow[]> {
  const result = await db.execute({
    sql: `
      SELECT s.item_id, s.participant_id, s.share_units
      FROM expense_item_splits s
      INNER JOIN expense_items i ON i.id = s.item_id
      WHERE i.room_id = ?
    `,
    args: [roomId]
  });

  return result.rows as unknown as ExpenseSplitRow[];
}

async function sanitizeExpenseItemInput(db: Client, roomId: string, payload: ExpenseItemInput) {
  const description = sanitizeItemDescription(payload.description);
  const amountCents = sanitizeAmountCents(payload.amountCents);
  const payerParticipantId = sanitizeRequiredId(payload.payerParticipantId, "missing_payer");
  const splits = sanitizeSplitInputs(payload.splits);
  const validParticipants = new Set((await listExpenseParticipants(db, roomId)).map((participant) => participant.id));

  if (!validParticipants.has(payerParticipantId)) {
    throw new HttpError(400, "invalid_payer");
  }

  for (const split of splits) {
    if (!validParticipants.has(split.participantId)) {
      throw new HttpError(400, "invalid_split_participant");
    }
  }

  return { description, amountCents, payerParticipantId, splits };
}

async function replaceExpenseItemSplits(db: Client, itemId: string, splits: Array<{ participantId: string; shareUnits: number }>): Promise<void> {
  await db.execute({
    sql: "DELETE FROM expense_item_splits WHERE item_id = ?",
    args: [itemId]
  });

  for (const split of splits) {
    await db.execute({
      sql: "INSERT INTO expense_item_splits (item_id, participant_id, share_units) VALUES (?, ?, ?)",
      args: [itemId, split.participantId, split.shareUnits]
    });
  }
}

async function touchExpenseRoom(db: Client, roomId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE expense_rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [roomId]
  });
}

function groupSplitsByItem(splits: ExpenseSplitRow[]): Map<string, ExpenseSplitRow[]> {
  const grouped = new Map<string, ExpenseSplitRow[]>();

  for (const split of splits) {
    grouped.set(split.item_id, [...(grouped.get(split.item_id) || []), split]);
  }

  return grouped;
}

export function calculateItemSplits(amountCents: number, splits: Array<{ participantId: string; shareUnits: number }>): CalculatedSplit[] {
  const totalUnits = splits.reduce((sum, split) => sum + split.shareUnits, 0);

  if (amountCents <= 0 || totalUnits <= 0) {
    return [];
  }

  const calculated = splits.map((split) => {
    const exactNumerator = amountCents * split.shareUnits;
    const amount = Math.floor(exactNumerator / totalUnits);

    return {
      participantId: split.participantId,
      shareUnits: split.shareUnits,
      amountCents: amount,
      remainder: exactNumerator % totalUnits
    };
  });
  let remaining = amountCents - calculated.reduce((sum, split) => sum + split.amountCents, 0);

  calculated
    .sort((a, b) => b.remainder - a.remainder || a.participantId.localeCompare(b.participantId))
    .forEach((split) => {
      if (remaining > 0) {
        split.amountCents += 1;
        remaining -= 1;
      }
    });

  return calculated
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map(({ participantId, shareUnits, amountCents }) => ({ participantId, shareUnits, amountCents }));
}

export function calculateBalances(participantIds: string[], items: Array<{ payerParticipantId: string; amountCents: number; splits: CalculatedSplit[] }>) {
  const balances = participantIds.map((participantId) => ({ participantId, balanceCents: 0 }));
  const byParticipant = new Map(balances.map((balance) => [balance.participantId, balance]));

  for (const item of items) {
    const payer = byParticipant.get(item.payerParticipantId);
    if (payer) {
      payer.balanceCents += item.amountCents;
    }

    for (const split of item.splits) {
      const participant = byParticipant.get(split.participantId);
      if (participant) {
        participant.balanceCents -= split.amountCents;
      }
    }
  }

  return balances.filter((balance) => balance.balanceCents !== 0);
}

export function optimizeSettlements(balances: Array<{ participantId: string; balanceCents: number }>): Settlement[] {
  const debtors = balances
    .filter((balance) => balance.balanceCents < 0)
    .map((balance) => ({ participantId: balance.participantId, amountCents: -balance.balanceCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.participantId.localeCompare(b.participantId));
  const creditors = balances
    .filter((balance) => balance.balanceCents > 0)
    .map((balance) => ({ participantId: balance.participantId, amountCents: balance.balanceCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.participantId.localeCompare(b.participantId));
  const settlements: Settlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amountCents, creditor.amountCents);

    if (amountCents > 0) {
      settlements.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amountCents
      });
    }

    debtor.amountCents -= amountCents;
    creditor.amountCents -= amountCents;

    if (debtor.amountCents === 0) {
      debtorIndex += 1;
    }

    if (creditor.amountCents === 0) {
      creditorIndex += 1;
    }
  }

  return settlements;
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

function mapExpenseRoom(row: ExpenseRoomRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExpenseParticipant(row: ExpenseParticipantRow) {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExpenseItem(row: ExpenseItemRow, splits: CalculatedSplit[]) {
  return {
    id: row.id,
    roomId: row.room_id,
    payerParticipantId: row.payer_participant_id,
    description: row.description,
    amountCents: row.amount_cents,
    createdByUserId: row.created_by_user_id,
    splits,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

function sanitizeRoomName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || "Nova divisao").slice(0, 120);
}

function sanitizeParticipantName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";

  if (!name) {
    throw new HttpError(400, "missing_participant_name");
  }

  return name.slice(0, 80);
}

function sanitizeItemDescription(value: unknown): string {
  const description = typeof value === "string" ? value.trim() : "";
  return (description || "Gasto").slice(0, 160);
}

function sanitizeAmountCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 999999999) {
    throw new HttpError(400, "invalid_amount");
  }

  return value;
}

function sanitizeRequiredId(value: unknown, error: string): string {
  const id = typeof value === "string" ? value.trim() : "";

  if (!id) {
    throw new HttpError(400, error);
  }

  return id;
}

function sanitizeSplitInputs(value: unknown): Array<{ participantId: string; shareUnits: number }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "missing_splits");
  }

  const splits = new Map<string, number>();

  for (const rawSplit of value) {
    const split = rawSplit as ExpenseItemSplitInput;
    const participantId = sanitizeRequiredId(split.participantId, "invalid_split_participant");
    const shareUnits = split.shareUnits;

    if (typeof shareUnits !== "number" || !Number.isInteger(shareUnits) || shareUnits <= 0 || shareUnits > 1000) {
      throw new HttpError(400, "invalid_share_units");
    }

    splits.set(participantId, (splits.get(participantId) || 0) + shareUnits);
  }

  return [...splits.entries()].map(([participantId, shareUnits]) => ({ participantId, shareUnits }));
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
