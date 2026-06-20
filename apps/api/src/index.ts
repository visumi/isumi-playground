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
  picture: string | null;
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

interface ExpensePaidSettlementRow {
  room_id: string;
  from_participant_id: string;
  to_participant_id: string;
  amount_cents: number;
  paid_at: string;
  paid_by_user_id: string;
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

interface ExpensePaidSettlementInput {
  fromParticipantId?: string;
  toParticipantId?: string;
  paid?: boolean;
}

type MonthlyExpenseType = "FIXO" | "VARIAVEL" | "RESERVA";

export interface MonthlyExpenseMonthRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  income_cents: number;
  variable_limit_cents: number;
  created_at: string;
  updated_at: string;
}

interface MonthlyExpenseCategoryRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MonthlyExpensePaymentMethodRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MonthlyExpenseItemRow {
  id: string;
  user_id: string;
  month_id: string;
  category_id: string;
  payment_method_id: string;
  description: string;
  amount_cents: number;
  total_purchase_cents: number;
  installment_number: number;
  installment_total: number;
  expense_type: MonthlyExpenseType;
  installment_group_id: string;
  created_at: string;
  updated_at: string;
}

interface MonthlyExpenseIngestTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  token_last4: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

type MonthlyExpensePendingStatus = "PENDING" | "APPROVED" | "DISMISSED";

interface MonthlyExpensePendingItemRow {
  id: string;
  user_id: string;
  month_id: string;
  description: string;
  amount_cents: number;
  transaction_date: string;
  merchant_name: string | null;
  raw_source: string | null;
  source_id: string | null;
  status: MonthlyExpensePendingStatus;
  approved_item_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MonthlyExpenseMonthInput {
  year?: number;
  month?: number;
}

interface MonthlyExpenseMonthSettingsInput {
  incomeCents?: number;
  variableLimitCents?: number;
}

interface MonthlyExpenseCatalogInput {
  name?: string;
  color?: string;
  archived?: boolean;
}

interface MonthlyExpenseItemInput {
  description?: string;
  categoryId?: string;
  paymentMethodId?: string;
  totalPurchaseCents?: number;
  installmentTotal?: number;
  expenseType?: MonthlyExpenseType;
}

interface MonthlyExpenseCsvImportInput {
  csv?: string;
}

interface MonthlyExpenseShortcutPendingInput {
  merchant?: string;
  amount?: string;
}

interface MonthlyExpensePendingApproveInput {
  description?: string;
  categoryId?: string;
  paymentMethodId?: string;
  installmentTotal?: number;
  expenseType?: MonthlyExpenseType;
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
  paid?: boolean;
  paidAt?: string;
  paidByUserId?: string;
}

interface ParticipantTotal {
  participantId: string;
  subtotalCents: number;
  totalCents: number;
}

type FirebaseKey = Awaited<ReturnType<typeof importX509>>;

let keyCache: { expiresAt: number; keys: Map<string, FirebaseKey> } | null = null;

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
const shortcutTransactionTimeZone = "America/Sao_Paulo";

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

    if (request.method === "POST" && url.pathname === "/tools/monthly-expenses/apple-pay/pending") {
      const db = createDatabaseClient(env);
      const payload = await readJson<MonthlyExpenseShortcutPendingInput>(request);
      return json(await createMonthlyExpensePendingFromShortcut(db, request, payload), 201, corsHeaders);
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

    if (url.pathname === "/tools/monthly-expenses/ingest-token") {
      if (request.method === "GET") {
        return json(await getMonthlyExpenseIngestTokenStatus(db, user.uid), 200, corsHeaders);
      }

      if (request.method === "POST") {
        return json(await createMonthlyExpenseIngestToken(db, user.uid), 201, corsHeaders);
      }

      if (request.method === "DELETE") {
        await revokeMonthlyExpenseIngestToken(db, user.uid);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    if (url.pathname === "/tools/monthly-expenses/months") {
      if (request.method === "GET") {
        return json(await listMonthlyExpenseMonths(db, user.uid), 200, corsHeaders);
      }

      if (request.method === "POST") {
        const payload = await readJson<MonthlyExpenseMonthInput>(request);
        return json(await createMonthlyExpenseMonth(db, user.uid, payload), 201, corsHeaders);
      }
    }

    const monthlyExpenseMonthMatch = url.pathname.match(/^\/tools\/monthly-expenses\/months\/([^/]+)$/);
    if (monthlyExpenseMonthMatch) {
      const monthId = monthlyExpenseMonthMatch[1];

      if (request.method === "GET") {
        return json(await getMonthlyExpenseMonthDetail(db, user.uid, monthId), 200, corsHeaders);
      }

      if (request.method === "PATCH") {
        const payload = await readJson<MonthlyExpenseMonthSettingsInput>(request);
        return json(await updateMonthlyExpenseMonthSettings(db, user.uid, monthId, payload), 200, corsHeaders);
      }
    }

    const monthlyExpenseFixedCarryOverMatch = url.pathname.match(/^\/tools\/monthly-expenses\/months\/([^/]+)\/fixed-expenses\/next$/);
    if (monthlyExpenseFixedCarryOverMatch && request.method === "POST") {
      return json(await migrateMonthlyFixedExpensesToNextMonth(db, user.uid, monthlyExpenseFixedCarryOverMatch[1]), 200, corsHeaders);
    }

    if (url.pathname === "/tools/monthly-expenses/categories") {
      if (request.method === "GET") {
        return json(await listMonthlyExpenseCategories(db, user.uid), 200, corsHeaders);
      }

      if (request.method === "POST") {
        const payload = await readJson<MonthlyExpenseCatalogInput>(request);
        return json(await createMonthlyExpenseCategory(db, user.uid, payload), 201, corsHeaders);
      }
    }

    const monthlyExpenseCategoryMatch = url.pathname.match(/^\/tools\/monthly-expenses\/categories\/([^/]+)$/);
    if (monthlyExpenseCategoryMatch && request.method === "PATCH") {
      const payload = await readJson<MonthlyExpenseCatalogInput>(request);
      return json(await updateMonthlyExpenseCategory(db, user.uid, monthlyExpenseCategoryMatch[1], payload), 200, corsHeaders);
    }

    if (url.pathname === "/tools/monthly-expenses/payment-methods") {
      if (request.method === "GET") {
        return json(await listMonthlyExpensePaymentMethods(db, user.uid), 200, corsHeaders);
      }

      if (request.method === "POST") {
        const payload = await readJson<MonthlyExpenseCatalogInput>(request);
        return json(await createMonthlyExpensePaymentMethod(db, user.uid, payload), 201, corsHeaders);
      }
    }

    const monthlyExpensePaymentMethodMatch = url.pathname.match(/^\/tools\/monthly-expenses\/payment-methods\/([^/]+)$/);
    if (monthlyExpensePaymentMethodMatch && request.method === "PATCH") {
      const payload = await readJson<MonthlyExpenseCatalogInput>(request);
      return json(await updateMonthlyExpensePaymentMethod(db, user.uid, monthlyExpensePaymentMethodMatch[1], payload), 200, corsHeaders);
    }

    const monthlyExpenseItemMatch = url.pathname.match(/^\/tools\/monthly-expenses\/months\/([^/]+)\/items(?:\/([^/]+))?$/);
    if (monthlyExpenseItemMatch) {
      const monthId = monthlyExpenseItemMatch[1];
      const itemId = monthlyExpenseItemMatch[2];

      if (request.method === "POST" && !itemId) {
        const payload = await readJson<MonthlyExpenseItemInput>(request);
        return json(await createMonthlyExpenseItem(db, user.uid, monthId, payload), 201, corsHeaders);
      }

      if (request.method === "PATCH" && itemId) {
        const payload = await readJson<MonthlyExpenseItemInput>(request);
        return json(await updateMonthlyExpenseItem(db, user.uid, monthId, itemId, payload), 200, corsHeaders);
      }

      if (request.method === "DELETE" && itemId) {
        await deleteMonthlyExpenseItem(db, user.uid, monthId, itemId);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    const monthlyExpensePendingMatch = url.pathname.match(/^\/tools\/monthly-expenses\/months\/([^/]+)\/pending(?:\/([^/]+))?(?:\/(approve))?$/);
    if (monthlyExpensePendingMatch) {
      const monthId = monthlyExpensePendingMatch[1];
      const pendingId = monthlyExpensePendingMatch[2];
      const action = monthlyExpensePendingMatch[3];

      if (request.method === "GET" && !pendingId) {
        return json(await listMonthlyExpensePendingItems(db, user.uid, monthId), 200, corsHeaders);
      }

      if (request.method === "POST" && pendingId && action === "approve") {
        const payload = await readJson<MonthlyExpensePendingApproveInput>(request);
        return json(await approveMonthlyExpensePendingItem(db, user.uid, monthId, pendingId, payload), 200, corsHeaders);
      }

      if (request.method === "DELETE" && pendingId && !action) {
        await dismissMonthlyExpensePendingItem(db, user.uid, monthId, pendingId);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    const monthlyExpenseCsvMatch = url.pathname.match(/^\/tools\/monthly-expenses\/months\/([^/]+)\/csv$/);
    if (monthlyExpenseCsvMatch) {
      const monthId = monthlyExpenseCsvMatch[1];

      if (request.method === "GET") {
        const csv = await exportMonthlyExpenseCsv(db, user.uid, monthId);
        return new Response(csv, {
          status: 200,
          headers: {
            ...Object.fromEntries(corsHeaders.entries()),
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"gastos-mensais.csv\""
          }
        });
      }

      if (request.method === "POST") {
        const payload = await readJson<MonthlyExpenseCsvImportInput>(request);
        return json(await importMonthlyExpenseCsv(db, user.uid, monthId, payload), 200, corsHeaders);
      }
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
        return json(await getExpenseRoomDetail(db, user, roomId, url.searchParams.get("accept") === "1"), 200, corsHeaders);
      }

      if (request.method === "DELETE") {
        await deleteExpenseRoom(db, user.uid, roomId);
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    const expensePaidSettlementMatch = url.pathname.match(/^\/tools\/expenses\/rooms\/([^/]+)\/settlements$/);
    if (expensePaidSettlementMatch && request.method === "PATCH") {
      const roomId = expensePaidSettlementMatch[1];
      const payload = await readJson<ExpensePaidSettlementInput>(request);
      return json(await updateExpensePaidSettlement(db, user.uid, roomId, payload), 200, corsHeaders);
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
        await deleteExpenseParticipant(db, user.uid, roomId, participantId);
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

export function isEmailAllowed(email: string, allowedEmails: string): boolean {
  const allowlist = allowedEmails
    .split(/[,\r\n\t ;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.trim().toLowerCase());
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

async function updateExpensePaidSettlement(db: Client, userId: string, roomId: string, payload: ExpensePaidSettlementInput) {
  await assertExpenseRoomMember(db, roomId, userId);
  const fromParticipantId = sanitizeRequiredId(payload.fromParticipantId, "missing_from_participant");
  const toParticipantId = sanitizeRequiredId(payload.toParticipantId, "missing_to_participant");

  if (fromParticipantId === toParticipantId) {
    throw new HttpError(400, "invalid_settlement_pair");
  }

  if (!payload.paid) {
    await db.execute({
      sql: `
        DELETE FROM expense_paid_settlements
        WHERE room_id = ? AND from_participant_id = ? AND to_participant_id = ?
      `,
      args: [roomId, fromParticipantId, toParticipantId]
    });
    return buildExpenseRoomDetail(db, roomId);
  }

  const detail = await buildExpenseRoomDetail(db, roomId);
  const settlement = detail.settlements.find((item) =>
    item.fromParticipantId === fromParticipantId && item.toParticipantId === toParticipantId
  );

  if (!settlement) {
    throw new HttpError(400, "invalid_settlement_pair");
  }

  await db.execute({
    sql: `
      INSERT INTO expense_paid_settlements (room_id, from_participant_id, to_participant_id, amount_cents, paid_at, paid_by_user_id)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(room_id, from_participant_id, to_participant_id) DO UPDATE SET
        amount_cents = excluded.amount_cents,
        paid_at = CURRENT_TIMESTAMP,
        paid_by_user_id = excluded.paid_by_user_id
    `,
    args: [roomId, fromParticipantId, toParticipantId, settlement.amountCents, userId]
  });

  return buildExpenseRoomDetail(db, roomId);
}

async function getExpenseRoomDetail(db: Client, user: AuthUser, roomId: string, acceptInvite = false) {
  const room = await findExpenseRoom(db, roomId);
  if (!room) {
    throw new HttpError(404, "not_found");
  }

  if (acceptInvite) {
    await ensureUserParticipant(db, room, user);
  } else {
    await assertExpenseRoomMember(db, roomId, user.uid);
  }

  return buildExpenseRoomDetail(db, roomId);
}

async function deleteExpenseRoom(db: Client, userId: string, roomId: string): Promise<void> {
  await assertExpenseRoomOwner(db, roomId, userId);

  await db.execute({
    sql: `
      DELETE FROM expense_paid_settlements
      WHERE room_id = ?
    `,
    args: [roomId]
  });
  await db.execute({
    sql: `
      DELETE FROM expense_item_splits
      WHERE item_id IN (
        SELECT id
        FROM expense_items
        WHERE room_id = ?
      )
    `,
    args: [roomId]
  });
  await db.execute({
    sql: "DELETE FROM expense_items WHERE room_id = ?",
    args: [roomId]
  });
  await db.execute({
    sql: "DELETE FROM expense_participants WHERE room_id = ?",
    args: [roomId]
  });
  await db.execute({
    sql: "DELETE FROM expense_rooms WHERE id = ?",
    args: [roomId]
  });
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

async function deleteExpenseParticipant(db: Client, userId: string, roomId: string, participantId: string): Promise<void> {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participant = await findExpenseParticipant(db, roomId, participantId);

  if (!participant) {
    throw new HttpError(404, "not_found");
  }

  await assertExpenseParticipantCanBeDeleted(db, roomId, participant);

  await db.execute({
    sql: "DELETE FROM expense_participants WHERE id = ? AND room_id = ?",
    args: [participantId, roomId]
  });
  await clearPaidSettlements(db, roomId);
  await touchExpenseRoom(db, roomId);
}

export async function assertExpenseParticipantCanBeDeleted(
  db: Pick<Client, "execute">,
  roomId: string,
  participant: { id: string; role: "owner" | "member" | "guest" }
): Promise<void> {
  if (participant.role === "owner") {
    throw new HttpError(403, "cannot_delete_owner_participant");
  }

  const linkedResult = await db.execute({
    sql: `
      SELECT 1
      FROM expense_items
      WHERE room_id = ? AND payer_participant_id = ?
      UNION ALL
      SELECT 1
      FROM expense_item_splits s
      INNER JOIN expense_items i ON i.id = s.item_id
      WHERE i.room_id = ? AND s.participant_id = ?
      UNION ALL
      SELECT 1
      FROM expense_paid_settlements
      WHERE room_id = ? AND (from_participant_id = ? OR to_participant_id = ?)
      LIMIT 1
    `,
    args: [roomId, participant.id, roomId, participant.id, roomId, participant.id, participant.id]
  });

  if (linkedResult.rows.length > 0) {
    throw new HttpError(409, "participant_has_expense_links");
  }
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
  await clearPaidSettlements(db, roomId);
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
  await clearPaidSettlements(db, roomId);
  await touchExpenseRoom(db, roomId);

  return buildExpenseRoomDetail(db, roomId);
}

async function deleteExpenseItem(db: Client, userId: string, roomId: string, itemId: string): Promise<void> {
  await assertExpenseRoomMember(db, roomId, userId);

  await db.execute({
    sql: "DELETE FROM expense_items WHERE id = ? AND room_id = ?",
    args: [itemId, roomId]
  });
  await clearPaidSettlements(db, roomId);
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
  const paidSettlements = await listExpensePaidSettlements(db, roomId);
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
  const participantIds = participants.map((participant) => participant.id);
  const subtotalCents = detailedItems.reduce((total, item) => total + item.amountCents, 0);
  const participantTotals = calculateParticipantTotals(participantIds, detailedItems);
  const balances = calculateBalances(participantIds, detailedItems);
  const paidByPair = new Map(paidSettlements.map((settlement) => [
    settlementKey(settlement.from_participant_id, settlement.to_participant_id),
    settlement
  ]));
  const settlements = optimizeSettlements(balances).map((settlement) => {
    const paid = paidByPair.get(settlementKey(settlement.fromParticipantId, settlement.toParticipantId));

    return {
      ...settlement,
      paid: Boolean(paid && paid.amount_cents === settlement.amountCents),
      paidAt: paid ? toUtcIsoTimestamp(paid.paid_at) : undefined,
      paidByUserId: paid?.paid_by_user_id
    };
  });

  return {
    room: mapExpenseRoom(room),
    subtotalCents,
    totalCents: subtotalCents,
    participants: participants.map(mapExpenseParticipant),
    items: detailedItems,
    participantTotals,
    balances,
    settlements
  };
}

async function listMonthlyExpenseMonths(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at
      FROM monthly_expense_months
      WHERE user_id = ?
      ORDER BY year DESC, month DESC
    `,
    args: [userId]
  });

  return (result.rows as unknown as MonthlyExpenseMonthRow[]).map(mapMonthlyExpenseMonth);
}

async function createMonthlyExpenseMonth(db: Client, userId: string, payload: MonthlyExpenseMonthInput) {
  const period = sanitizeMonthlyExpensePeriod(payload.year, payload.month);
  const existing = await findMonthlyExpenseMonthByPeriod(db, userId, period.year, period.month);

  if (existing) {
    throw new HttpError(409, "monthly_expense_month_exists");
  }

  const previous = await findPreviousMonthlyExpenseMonth(db, userId, period.year, period.month);
  const monthId = crypto.randomUUID();

  await db.execute({
    sql: `
      INSERT INTO monthly_expense_months (id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [
      monthId,
      userId,
      period.year,
      period.month,
      previous?.income_cents || 0,
      previous?.variable_limit_cents || 0
    ]
  });

  return getMonthlyExpenseMonthDetail(db, userId, monthId);
}

async function getMonthlyExpenseMonthDetail(db: Client, userId: string, monthId: string) {
  const month = await findMonthlyExpenseMonth(db, userId, monthId);
  if (!month) {
    throw new HttpError(404, "not_found");
  }

  const [categories, paymentMethods, items] = await Promise.all([
    listMonthlyExpenseCategories(db, userId),
    listMonthlyExpensePaymentMethods(db, userId),
    listMonthlyExpenseItems(db, userId, monthId)
  ]);

  return buildMonthlyExpenseDetail(month, categories, paymentMethods, items);
}

async function updateMonthlyExpenseMonthSettings(db: Client, userId: string, monthId: string, payload: MonthlyExpenseMonthSettingsInput) {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  const incomeCents = sanitizeNonNegativeCents(payload.incomeCents, "invalid_income");
  const variableLimitCents = sanitizeNonNegativeCents(payload.variableLimitCents, "invalid_variable_limit");

  await db.execute({
    sql: `
      UPDATE monthly_expense_months
      SET income_cents = ?, variable_limit_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    args: [incomeCents, variableLimitCents, monthId, userId]
  });

  return getMonthlyExpenseMonthDetail(db, userId, monthId);
}

async function listMonthlyExpenseCategories(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, name, color, archived_at, created_at, updated_at
      FROM monthly_expense_categories
      WHERE user_id = ?
      ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE
    `,
    args: [userId]
  });

  return (result.rows as unknown as MonthlyExpenseCategoryRow[]).map(mapMonthlyExpenseCategory);
}

async function createMonthlyExpenseCategory(db: Client, userId: string, payload: MonthlyExpenseCatalogInput) {
  const id = crypto.randomUUID();
  await db.execute({
    sql: `
      INSERT INTO monthly_expense_categories (id, user_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [id, userId, sanitizeCatalogName(payload.name), sanitizeCatalogColor(payload.color)]
  });

  return listMonthlyExpenseCategories(db, userId);
}

async function updateMonthlyExpenseCategory(db: Client, userId: string, categoryId: string, payload: MonthlyExpenseCatalogInput) {
  await assertMonthlyExpenseCategory(db, userId, categoryId, { allowArchived: true });
  await db.execute({
    sql: `
      UPDATE monthly_expense_categories
      SET name = ?, color = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    args: [
      sanitizeCatalogName(payload.name),
      sanitizeCatalogColor(payload.color),
      payload.archived ? new Date().toISOString() : null,
      categoryId,
      userId
    ]
  });

  return listMonthlyExpenseCategories(db, userId);
}

async function listMonthlyExpensePaymentMethods(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, name, color, archived_at, created_at, updated_at
      FROM monthly_expense_payment_methods
      WHERE user_id = ?
      ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE
    `,
    args: [userId]
  });

  return (result.rows as unknown as MonthlyExpensePaymentMethodRow[]).map(mapMonthlyExpensePaymentMethod);
}

async function createMonthlyExpensePaymentMethod(db: Client, userId: string, payload: MonthlyExpenseCatalogInput) {
  const id = crypto.randomUUID();
  await db.execute({
    sql: `
      INSERT INTO monthly_expense_payment_methods (id, user_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [id, userId, sanitizeCatalogName(payload.name), sanitizeCatalogColor(payload.color)]
  });

  return listMonthlyExpensePaymentMethods(db, userId);
}

async function updateMonthlyExpensePaymentMethod(db: Client, userId: string, methodId: string, payload: MonthlyExpenseCatalogInput) {
  await assertMonthlyExpensePaymentMethod(db, userId, methodId, { allowArchived: true });
  await db.execute({
    sql: `
      UPDATE monthly_expense_payment_methods
      SET name = ?, color = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    args: [
      sanitizeCatalogName(payload.name),
      sanitizeCatalogColor(payload.color),
      payload.archived ? new Date().toISOString() : null,
      methodId,
      userId
    ]
  });

  return listMonthlyExpensePaymentMethods(db, userId);
}

async function createMonthlyExpenseItem(db: Client, userId: string, monthId: string, payload: MonthlyExpenseItemInput) {
  const month = await assertMonthlyExpenseMonth(db, userId, monthId);
  const item = await sanitizeMonthlyExpenseItemInput(db, userId, payload);
  const installmentAmounts = splitInstallmentAmounts(item.totalPurchaseCents, item.installmentTotal);
  const groupId = crypto.randomUUID();

  for (let index = 0; index < item.installmentTotal; index += 1) {
    const target = addMonths(month.year, month.month, index);
    const targetMonth = index === 0
      ? month
      : await ensureMonthlyExpenseMonthByPeriod(db, userId, target.year, target.month);

    await insertMonthlyExpenseItem(db, userId, targetMonth.id, {
      ...item,
      amountCents: installmentAmounts[index],
      installmentNumber: index + 1,
      installmentGroupId: groupId
    });
  }

  return getMonthlyExpenseMonthDetail(db, userId, monthId);
}

export async function migrateMonthlyFixedExpensesToNextMonth(db: Client, userId: string, monthId: string) {
  const month = await assertMonthlyExpenseMonth(db, userId, monthId);
  const nextPeriod = addMonths(month.year, month.month, 1);
  const nextMonth = await ensureMonthlyExpenseMonthByPeriod(db, userId, nextPeriod.year, nextPeriod.month);
  const copied = await copyMonthlySimpleFixedExpenses(db, userId, month.id, nextMonth.id);

  return {
    copied,
    detail: await getMonthlyExpenseMonthDetail(db, userId, nextMonth.id)
  };
}

async function updateMonthlyExpenseItem(db: Client, userId: string, monthId: string, itemId: string, payload: MonthlyExpenseItemInput) {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  await assertMonthlyExpenseItem(db, userId, monthId, itemId);
  const item = await sanitizeMonthlyExpenseItemInput(db, userId, { ...payload, installmentTotal: 1 });

  await db.execute({
    sql: `
      UPDATE monthly_expense_items
      SET category_id = ?, payment_method_id = ?, description = ?, amount_cents = ?, total_purchase_cents = ?,
        installment_number = 1, installment_total = 1, expense_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND month_id = ?
    `,
    args: [
      item.categoryId,
      item.paymentMethodId,
      item.description,
      item.totalPurchaseCents,
      item.totalPurchaseCents,
      item.expenseType,
      itemId,
      userId,
      monthId
    ]
  });

  return getMonthlyExpenseMonthDetail(db, userId, monthId);
}

async function deleteMonthlyExpenseItem(db: Client, userId: string, monthId: string, itemId: string): Promise<void> {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  await db.execute({
    sql: "DELETE FROM monthly_expense_items WHERE id = ? AND user_id = ? AND month_id = ?",
    args: [itemId, userId, monthId]
  });
}

async function exportMonthlyExpenseCsv(db: Client, userId: string, monthId: string): Promise<string> {
  const detail = await getMonthlyExpenseMonthDetail(db, userId, monthId);
  return serializeMonthlyExpenseCsv(detail.items.map((item: any) => ({
    descricao: item.description,
    categoria: item.categoryName,
    valor_total: formatCsvMoney(item.totalPurchaseCents),
    numero_parcelas: String(item.installmentTotal),
    parcela_atual: String(item.installmentNumber),
    metodo_pagamento: item.paymentMethodName,
    tipo: item.expenseType
  })));
}

async function importMonthlyExpenseCsv(db: Client, userId: string, monthId: string, payload: MonthlyExpenseCsvImportInput) {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  const csv = typeof payload.csv === "string" ? payload.csv : "";
  const rows = parseMonthlyExpenseCsv(csv);
  const categories = await listMonthlyExpenseCategoryRows(db, userId);
  const methods = await listMonthlyExpensePaymentMethodRows(db, userId);
  const items = await listMonthlyExpenseItems(db, userId, monthId);
  const categoryByName = new Map(categories.filter((item) => !item.archived_at).map((item) => [normalizeCatalogKey(item.name), item]));
  const methodByName = new Map(methods.filter((item) => !item.archived_at).map((item) => [normalizeCatalogKey(item.name), item]));
  const existingKeys = new Set(items.map((item) => monthlyExpenseDuplicateKey({
    description: item.description,
    totalPurchaseCents: item.total_purchase_cents,
    installmentNumber: item.installment_number,
    installmentTotal: item.installment_total,
    expenseType: item.expense_type,
    categoryName: categories.find((category) => category.id === item.category_id)?.name || "",
    paymentMethodName: methods.find((method) => method.id === item.payment_method_id)?.name || ""
  })));
  const errors: Array<{ line: number; message: string }> = [];
  const validRows: Array<ReturnType<typeof normalizeMonthlyExpenseCsvRow> & { categoryId: string; paymentMethodId: string }> = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    try {
      const normalized = normalizeMonthlyExpenseCsvRow(row);
      const category = categoryByName.get(normalizeCatalogKey(normalized.categoria));
      const method = methodByName.get(normalizeCatalogKey(normalized.metodo_pagamento));

      if (!category) {
        throw new HttpError(400, "categoria_nao_cadastrada");
      }

      if (!method) {
        throw new HttpError(400, "metodo_pagamento_nao_cadastrado");
      }

      const key = monthlyExpenseDuplicateKey({
        description: normalized.descricao,
        totalPurchaseCents: normalized.totalPurchaseCents,
        installmentNumber: normalized.parcela_atual,
        installmentTotal: normalized.numero_parcelas,
        expenseType: normalized.tipo,
        categoryName: category.name,
        paymentMethodName: method.name
      });

      if (existingKeys.has(key) || seenKeys.has(key)) {
        throw new HttpError(409, "provavel_duplicado");
      }

      seenKeys.add(key);
      validRows.push({ ...normalized, categoryId: category.id, paymentMethodId: method.id });
    } catch (error) {
      errors.push({ line: index + 2, message: error instanceof Error ? error.message : "linha_invalida" });
    }
  });

  if (errors.length > 0) {
    return { imported: 0, errors, detail: await getMonthlyExpenseMonthDetail(db, userId, monthId) };
  }

  for (const row of validRows) {
    await insertMonthlyExpenseItem(db, userId, monthId, {
      description: row.descricao,
      categoryId: row.categoryId,
      paymentMethodId: row.paymentMethodId,
      totalPurchaseCents: row.totalPurchaseCents,
      amountCents: splitInstallmentAmounts(row.totalPurchaseCents, row.numero_parcelas)[row.parcela_atual - 1],
      installmentNumber: row.parcela_atual,
      installmentTotal: row.numero_parcelas,
      expenseType: row.tipo,
      installmentGroupId: crypto.randomUUID()
    });
  }

  return { imported: validRows.length, errors: [], detail: await getMonthlyExpenseMonthDetail(db, userId, monthId) };
}

async function getMonthlyExpenseIngestTokenStatus(db: Client, userId: string) {
  const token = await findActiveMonthlyExpenseIngestToken(db, userId);

  if (!token) {
    return { active: false };
  }

  return {
    active: true,
    tokenLast4: token.token_last4,
    lastUsedAt: token.last_used_at ? toUtcIsoTimestamp(token.last_used_at) : null,
    createdAt: toUtcIsoTimestamp(token.created_at)
  };
}

async function createMonthlyExpenseIngestToken(db: Client, userId: string) {
  const token = generateShortcutToken();
  const tokenHash = await hashShortcutToken(token);
  const tokenId = crypto.randomUUID();

  await db.execute({
    sql: `
      UPDATE monthly_expense_ingest_tokens
      SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revoked_at IS NULL
    `,
    args: [userId]
  });

  await db.execute({
    sql: `
      INSERT INTO monthly_expense_ingest_tokens (id, user_id, token_hash, token_last4, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [tokenId, userId, tokenHash, token.slice(-4)]
  });

  return {
    active: true,
    token,
    tokenLast4: token.slice(-4),
    lastUsedAt: null,
    createdAt: new Date().toISOString()
  };
}

async function revokeMonthlyExpenseIngestToken(db: Client, userId: string): Promise<void> {
  await db.execute({
    sql: `
      UPDATE monthly_expense_ingest_tokens
      SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revoked_at IS NULL
    `,
    args: [userId]
  });
}

async function createMonthlyExpensePendingFromShortcut(db: Client, request: Request, payload: MonthlyExpenseShortcutPendingInput) {
  const token = await authenticateMonthlyExpenseShortcutToken(db, request);
  await touchMonthlyExpenseIngestToken(db, token.id);
  const input = sanitizeMonthlyExpenseShortcutPendingInput(payload);
  const existing = input.sourceId ? await findMonthlyExpensePendingBySource(db, token.user_id, input.sourceId) : null;

  if (existing) {
    return { pending: mapMonthlyExpensePendingItem(existing), duplicate: true };
  }

  const period = monthlyExpensePeriodFromDate(input.transactionDate);
  const month = await ensureMonthlyExpenseMonthByPeriod(db, token.user_id, period.year, period.month);
  const pendingId = crypto.randomUUID();

  await db.execute({
    sql: `
      INSERT INTO monthly_expense_pending_items (
        id, user_id, month_id, description, amount_cents, transaction_date, merchant_name,
        raw_source, source_id, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [
      pendingId,
      token.user_id,
      month.id,
      input.description,
      input.amountCents,
      input.transactionDate,
      input.merchantName,
      JSON.stringify(payload),
      input.sourceId
    ]
  });

  const created = await findMonthlyExpensePendingItem(db, token.user_id, month.id, pendingId, { includeClosed: true });
  if (!created) {
    throw new HttpError(500, "monthly_expense_pending_create_failed");
  }

  return { pending: mapMonthlyExpensePendingItem(created), duplicate: false };
}

async function touchMonthlyExpenseIngestToken(db: Client, tokenId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE monthly_expense_ingest_tokens SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [tokenId]
  });
}

async function listMonthlyExpensePendingItems(db: Client, userId: string, monthId: string) {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  const result = await db.execute({
    sql: `
      SELECT id, user_id, month_id, description, amount_cents, transaction_date, merchant_name, raw_source,
        source_id, status, approved_item_id, created_at, updated_at
      FROM monthly_expense_pending_items
      WHERE user_id = ? AND month_id = ? AND status = 'PENDING'
      ORDER BY transaction_date DESC, created_at DESC, id DESC
    `,
    args: [userId, monthId]
  });

  return (result.rows as unknown as MonthlyExpensePendingItemRow[]).map(mapMonthlyExpensePendingItem);
}

async function approveMonthlyExpensePendingItem(
  db: Client,
  userId: string,
  monthId: string,
  pendingId: string,
  payload: MonthlyExpensePendingApproveInput
) {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  const pending = await findMonthlyExpensePendingItem(db, userId, monthId, pendingId);
  if (!pending) {
    throw new HttpError(404, "not_found");
  }

  const detail = await createMonthlyExpenseItem(db, userId, monthId, {
    description: typeof payload.description === "string" && payload.description.trim()
      ? payload.description
      : pending.merchant_name || pending.description,
    categoryId: payload.categoryId,
    paymentMethodId: payload.paymentMethodId,
    totalPurchaseCents: pending.amount_cents,
    installmentTotal: payload.installmentTotal,
    expenseType: payload.expenseType
  });

  await db.execute({
    sql: `
      UPDATE monthly_expense_pending_items
      SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND month_id = ? AND status = 'PENDING'
    `,
    args: [pendingId, userId, monthId]
  });

  return detail;
}

async function dismissMonthlyExpensePendingItem(db: Client, userId: string, monthId: string, pendingId: string): Promise<void> {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  await db.execute({
    sql: `
      UPDATE monthly_expense_pending_items
      SET status = 'DISMISSED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND month_id = ? AND status = 'PENDING'
    `,
    args: [pendingId, userId, monthId]
  });
}

async function authenticateMonthlyExpenseShortcutToken(db: Client, request: Request): Promise<MonthlyExpenseIngestTokenRow> {
  const header = request.headers.get("Authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!token) {
    throw new HttpError(401, "missing_token");
  }

  const tokenHash = await hashShortcutToken(token);
  const result = await db.execute({
    sql: `
      SELECT id, user_id, token_hash, token_last4, last_used_at, revoked_at, created_at, updated_at
      FROM monthly_expense_ingest_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `,
    args: [tokenHash]
  });
  const row = result.rows[0] as unknown as MonthlyExpenseIngestTokenRow | undefined;

  if (!row) {
    throw new HttpError(401, "invalid_token");
  }

  return row;
}

async function findActiveMonthlyExpenseIngestToken(db: Client, userId: string): Promise<MonthlyExpenseIngestTokenRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, token_hash, token_last4, last_used_at, revoked_at, created_at, updated_at
      FROM monthly_expense_ingest_tokens
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    args: [userId]
  });

  return (result.rows[0] as unknown as MonthlyExpenseIngestTokenRow | undefined) || null;
}

async function findMonthlyExpensePendingBySource(db: Client, userId: string, sourceId: string): Promise<MonthlyExpensePendingItemRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, month_id, description, amount_cents, transaction_date, merchant_name, raw_source,
        source_id, status, approved_item_id, created_at, updated_at
      FROM monthly_expense_pending_items
      WHERE user_id = ? AND source_id = ?
      LIMIT 1
    `,
    args: [userId, sourceId]
  });

  return (result.rows[0] as unknown as MonthlyExpensePendingItemRow | undefined) || null;
}

async function findMonthlyExpensePendingItem(
  db: Client,
  userId: string,
  monthId: string,
  pendingId: string,
  options: { includeClosed?: boolean } = {}
): Promise<MonthlyExpensePendingItemRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, month_id, description, amount_cents, transaction_date, merchant_name, raw_source,
        source_id, status, approved_item_id, created_at, updated_at
      FROM monthly_expense_pending_items
      WHERE id = ? AND user_id = ? AND month_id = ? ${options.includeClosed ? "" : "AND status = 'PENDING'"}
      LIMIT 1
    `,
    args: [pendingId, userId, monthId]
  });

  return (result.rows[0] as unknown as MonthlyExpensePendingItemRow | undefined) || null;
}

async function findMonthlyExpenseMonth(db: Client, userId: string, monthId: string): Promise<MonthlyExpenseMonthRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at
      FROM monthly_expense_months
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    args: [monthId, userId]
  });

  return (result.rows[0] as unknown as MonthlyExpenseMonthRow | undefined) || null;
}

async function findMonthlyExpenseMonthByPeriod(db: Client, userId: string, year: number, month: number): Promise<MonthlyExpenseMonthRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at
      FROM monthly_expense_months
      WHERE user_id = ? AND year = ? AND month = ?
      LIMIT 1
    `,
    args: [userId, year, month]
  });

  return (result.rows[0] as unknown as MonthlyExpenseMonthRow | undefined) || null;
}

async function findPreviousMonthlyExpenseMonth(db: Client, userId: string, year: number, month: number): Promise<MonthlyExpenseMonthRow | null> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at
      FROM monthly_expense_months
      WHERE user_id = ? AND (year < ? OR (year = ? AND month < ?))
      ORDER BY year DESC, month DESC
      LIMIT 1
    `,
    args: [userId, year, year, month]
  });

  return (result.rows[0] as unknown as MonthlyExpenseMonthRow | undefined) || null;
}

async function ensureMonthlyExpenseMonthByPeriod(db: Client, userId: string, year: number, month: number): Promise<MonthlyExpenseMonthRow> {
  const existing = await findMonthlyExpenseMonthByPeriod(db, userId, year, month);
  if (existing) {
    return existing;
  }

  const previous = await findPreviousMonthlyExpenseMonth(db, userId, year, month);
  const monthId = crypto.randomUUID();
  await db.execute({
    sql: `
      INSERT INTO monthly_expense_months (id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [monthId, userId, year, month, previous?.income_cents || 0, previous?.variable_limit_cents || 0]
  });

  const created = await findMonthlyExpenseMonth(db, userId, monthId);
  if (!created) {
    throw new HttpError(500, "monthly_expense_month_create_failed");
  }

  return created;
}

async function assertMonthlyExpenseMonth(db: Client, userId: string, monthId: string): Promise<MonthlyExpenseMonthRow> {
  const month = await findMonthlyExpenseMonth(db, userId, monthId);
  if (!month) {
    throw new HttpError(404, "not_found");
  }

  return month;
}

async function listMonthlyExpenseCategoryRows(db: Client, userId: string): Promise<MonthlyExpenseCategoryRow[]> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, name, color, archived_at, created_at, updated_at
      FROM monthly_expense_categories
      WHERE user_id = ?
      ORDER BY name COLLATE NOCASE
    `,
    args: [userId]
  });

  return result.rows as unknown as MonthlyExpenseCategoryRow[];
}

async function listMonthlyExpensePaymentMethodRows(db: Client, userId: string): Promise<MonthlyExpensePaymentMethodRow[]> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, name, color, archived_at, created_at, updated_at
      FROM monthly_expense_payment_methods
      WHERE user_id = ?
      ORDER BY name COLLATE NOCASE
    `,
    args: [userId]
  });

  return result.rows as unknown as MonthlyExpensePaymentMethodRow[];
}

async function assertMonthlyExpenseCategory(db: Client, userId: string, categoryId: string, options: { allowArchived?: boolean } = {}): Promise<void> {
  const result = await db.execute({
    sql: "SELECT archived_at FROM monthly_expense_categories WHERE id = ? AND user_id = ? LIMIT 1",
    args: [categoryId, userId]
  });
  const row = result.rows[0] as { archived_at?: string | null } | undefined;

  if (!row || (!options.allowArchived && row.archived_at)) {
    throw new HttpError(400, "invalid_category");
  }
}

async function assertMonthlyExpensePaymentMethod(db: Client, userId: string, methodId: string, options: { allowArchived?: boolean } = {}): Promise<void> {
  const result = await db.execute({
    sql: "SELECT archived_at FROM monthly_expense_payment_methods WHERE id = ? AND user_id = ? LIMIT 1",
    args: [methodId, userId]
  });
  const row = result.rows[0] as { archived_at?: string | null } | undefined;

  if (!row || (!options.allowArchived && row.archived_at)) {
    throw new HttpError(400, "invalid_payment_method");
  }
}

async function listMonthlyExpenseItems(db: Client, userId: string, monthId: string): Promise<MonthlyExpenseItemRow[]> {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, month_id, category_id, payment_method_id, description, amount_cents, total_purchase_cents,
        installment_number, installment_total, expense_type, installment_group_id, created_at, updated_at
      FROM monthly_expense_items
      WHERE user_id = ? AND month_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    args: [userId, monthId]
  });

  return result.rows as unknown as MonthlyExpenseItemRow[];
}

async function copyMonthlySimpleFixedExpenses(db: Client, userId: string, sourceMonthId: string, targetMonthId: string): Promise<number> {
  const [sourceItems, targetItems] = await Promise.all([
    listMonthlyExpenseItems(db, userId, sourceMonthId),
    listMonthlyExpenseItems(db, userId, targetMonthId)
  ]);
  const targetKeys = new Set(
    targetItems
      .filter(isSimpleMonthlyFixedExpense)
      .map(monthlyExpenseSimpleFixedKey)
  );
  let copied = 0;

  for (const item of sourceItems.filter(isSimpleMonthlyFixedExpense)) {
    const key = monthlyExpenseSimpleFixedKey(item);
    if (targetKeys.has(key)) {
      continue;
    }

    await insertMonthlyExpenseItem(db, userId, targetMonthId, {
      description: item.description,
      categoryId: item.category_id,
      paymentMethodId: item.payment_method_id,
      totalPurchaseCents: item.total_purchase_cents,
      amountCents: item.amount_cents,
      installmentNumber: 1,
      installmentTotal: 1,
      expenseType: "FIXO",
      installmentGroupId: crypto.randomUUID()
    });
    targetKeys.add(key);
    copied += 1;
  }

  return copied;
}

function isSimpleMonthlyFixedExpense(item: MonthlyExpenseItemRow): boolean {
  return item.expense_type === "FIXO" && item.installment_number === 1 && item.installment_total === 1;
}

function monthlyExpenseSimpleFixedKey(item: MonthlyExpenseItemRow): string {
  return [
    item.description.trim().toLocaleLowerCase("pt-BR"),
    item.category_id,
    item.payment_method_id,
    item.amount_cents,
    item.total_purchase_cents
  ].join("|");
}

async function assertMonthlyExpenseItem(db: Client, userId: string, monthId: string, itemId: string): Promise<void> {
  const result = await db.execute({
    sql: "SELECT id FROM monthly_expense_items WHERE id = ? AND user_id = ? AND month_id = ? LIMIT 1",
    args: [itemId, userId, monthId]
  });

  if (result.rows.length === 0) {
    throw new HttpError(404, "not_found");
  }
}

async function sanitizeMonthlyExpenseItemInput(db: Client, userId: string, payload: MonthlyExpenseItemInput) {
  const categoryId = sanitizeRequiredId(payload.categoryId, "missing_category");
  const paymentMethodId = sanitizeRequiredId(payload.paymentMethodId, "missing_payment_method");
  await assertMonthlyExpenseCategory(db, userId, categoryId);
  await assertMonthlyExpensePaymentMethod(db, userId, paymentMethodId);

  return {
    description: sanitizeItemDescription(payload.description),
    categoryId,
    paymentMethodId,
    totalPurchaseCents: sanitizeAmountCents(payload.totalPurchaseCents),
    installmentTotal: sanitizeInstallmentTotal(payload.installmentTotal),
    expenseType: sanitizeMonthlyExpenseType(payload.expenseType)
  };
}

async function insertMonthlyExpenseItem(
  db: Client,
  userId: string,
  monthId: string,
  item: {
    description: string;
    categoryId: string;
    paymentMethodId: string;
    totalPurchaseCents: number;
    amountCents: number;
    installmentNumber: number;
    installmentTotal: number;
    expenseType: MonthlyExpenseType;
    installmentGroupId: string;
  }
): Promise<void> {
  await db.execute({
    sql: `
      INSERT INTO monthly_expense_items (
        id, user_id, month_id, category_id, payment_method_id, description, amount_cents, total_purchase_cents,
        installment_number, installment_total, expense_type, installment_group_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [
      crypto.randomUUID(),
      userId,
      monthId,
      item.categoryId,
      item.paymentMethodId,
      item.description,
      item.amountCents,
      item.totalPurchaseCents,
      item.installmentNumber,
      item.installmentTotal,
      item.expenseType,
      item.installmentGroupId
    ]
  });
}

function buildMonthlyExpenseDetail(
  month: MonthlyExpenseMonthRow,
  categories: ReturnType<typeof mapMonthlyExpenseCategory>[],
  paymentMethods: ReturnType<typeof mapMonthlyExpensePaymentMethod>[],
  items: MonthlyExpenseItemRow[]
) {
  const categoryById = new Map(categories.map((item) => [item.id, item]));
  const methodById = new Map(paymentMethods.map((item) => [item.id, item]));
  const detailedItems = items.map((item) => {
    const category = categoryById.get(item.category_id);
    const method = methodById.get(item.payment_method_id);

    return {
      id: item.id,
      monthId: item.month_id,
      categoryId: item.category_id,
      categoryName: category?.name || "Categoria",
      categoryColor: category?.color || "#9333ea",
      paymentMethodId: item.payment_method_id,
      paymentMethodName: method?.name || "Pagamento",
      paymentMethodColor: method?.color || "#2563eb",
      description: item.description,
      amountCents: item.amount_cents,
      totalPurchaseCents: item.total_purchase_cents,
      installmentNumber: item.installment_number,
      installmentTotal: item.installment_total,
      expenseType: item.expense_type,
      installmentGroupId: item.installment_group_id,
      createdAt: toUtcIsoTimestamp(item.created_at),
      updatedAt: toUtcIsoTimestamp(item.updated_at)
    };
  });
  const summary = calculateMonthlyExpenseSummary({
    incomeCents: month.income_cents,
    variableLimitCents: month.variable_limit_cents,
    items: detailedItems
  });

  return {
    month: mapMonthlyExpenseMonth(month),
    summary,
    categories,
    paymentMethods,
    items: detailedItems
  };
}

export function calculateMonthlyExpenseSummary(input: {
  incomeCents: number;
  variableLimitCents: number;
  items: Array<{ amountCents: number; expenseType: MonthlyExpenseType }>;
}) {
  const fixedCents = input.items
    .filter((item) => item.expenseType === "FIXO")
    .reduce((total, item) => total + item.amountCents, 0);
  const variableCents = input.items
    .filter((item) => item.expenseType === "VARIAVEL")
    .reduce((total, item) => total + item.amountCents, 0);
  const reserveCents = input.items
    .filter((item) => item.expenseType === "RESERVA")
    .reduce((total, item) => total + item.amountCents, 0);

  return {
    incomeCents: input.incomeCents,
    variableLimitCents: input.variableLimitCents,
    variableSpentCents: variableCents,
    variableRemainingCents: input.variableLimitCents - variableCents,
    fixedTotalCents: fixedCents,
    reserveTotalCents: reserveCents,
    monthTotalCents: fixedCents + variableCents + reserveCents,
    unallocatedCents: input.incomeCents - fixedCents - input.variableLimitCents
  };
}

export function splitInstallmentAmounts(totalCents: number, installmentTotal: number): number[] {
  const safeTotal = sanitizeAmountCents(totalCents);
  const safeInstallments = sanitizeInstallmentTotal(installmentTotal);
  const base = Math.floor(safeTotal / safeInstallments);
  let remainder = safeTotal - base * safeInstallments;

  return Array.from({ length: safeInstallments }, () => {
    const amount = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return amount;
  });
}

function mapMonthlyExpenseMonth(row: MonthlyExpenseMonthRow) {
  return {
    id: row.id,
    userId: row.user_id,
    year: row.year,
    month: row.month,
    incomeCents: row.income_cents,
    variableLimitCents: row.variable_limit_cents,
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function mapMonthlyExpenseCategory(row: MonthlyExpenseCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: Boolean(row.archived_at),
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function mapMonthlyExpensePaymentMethod(row: MonthlyExpensePaymentMethodRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: Boolean(row.archived_at),
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function mapMonthlyExpensePendingItem(row: MonthlyExpensePendingItemRow) {
  return {
    id: row.id,
    monthId: row.month_id,
    merchantName: row.merchant_name || row.description,
    amount: row.amount_cents,
    transactionDate: row.transaction_date,
    sourceId: row.source_id,
    status: row.status,
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function sanitizeMonthlyExpensePeriod(year: unknown, month: unknown): { year: number; month: number } {
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HttpError(400, "invalid_year");
  }

  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, "invalid_month");
  }

  return { year, month };
}

function sanitizeNonNegativeCents(value: unknown, error: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999999999) {
    throw new HttpError(400, error);
  }

  return value;
}

function sanitizeCatalogName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new HttpError(400, "missing_name");
  }

  return name.slice(0, 80);
}

function sanitizeCatalogColor(value: unknown): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#9333ea";
}

function sanitizeInstallmentTotal(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 120) {
    throw new HttpError(400, "invalid_installments");
  }

  return value;
}

function sanitizeMonthlyExpenseType(value: unknown): MonthlyExpenseType {
  if (value === "FIXO" || value === "VARIAVEL" || value === "RESERVA") {
    return value;
  }

  throw new HttpError(400, "invalid_expense_type");
}

export function sanitizeMonthlyExpenseShortcutPendingInput(payload: MonthlyExpenseShortcutPendingInput) {
  assertExactShortcutPayload(payload);
  const merchantName = sanitizeShortcutMerchant(payload.merchant);

  return {
    description: sanitizeItemDescription(merchantName),
    amountCents: parseShortcutMoneyAmount(payload.amount),
    transactionDate: currentShortcutTransactionDate(),
    merchantName,
    sourceId: null
  };
}

function assertExactShortcutPayload(payload: MonthlyExpenseShortcutPendingInput): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "invalid_shortcut_payload");
  }

  const keys = Object.keys(payload).sort();
  if (keys.length !== 2 || keys[0] !== "amount" || keys[1] !== "merchant") {
    throw new HttpError(400, "invalid_shortcut_payload");
  }
}

function sanitizeShortcutMerchant(value: unknown): string {
  const merchant = sanitizeOptionalText(value, 160);

  if (!merchant) {
    throw new HttpError(400, "invalid_merchant");
  }

  return merchant;
}

export function parseShortcutMoneyAmount(value: unknown): number {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_amount");
  }

  const compact = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  const normalized = normalizeMoneyNumber(compact);
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, "invalid_amount");
  }

  return sanitizeAmountCents(Math.round(parsed * 100));
}

function normalizeMoneyNumber(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = value.replace(/-/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex === -1) {
    return `${negative ? "-" : ""}${unsigned}`;
  }

  const fraction = unsigned.slice(decimalIndex + 1);

  if (fraction.length === 0 || fraction.length > 2) {
    return `${negative ? "-" : ""}${unsigned.replace(/[,.]/g, "")}`;
  }

  const whole = unsigned.slice(0, decimalIndex).replace(/[,.]/g, "");
  return `${negative ? "-" : ""}${whole || "0"}.${fraction}`;
}

function currentShortcutTransactionDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: shortcutTransactionTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return sanitizeTransactionDate(`${values["year"]}-${values["month"]}-${values["day"]}`);
}

function sanitizeTransactionDate(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new HttpError(400, "invalid_transaction_date");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 2000 ||
    year > 2100
  ) {
    throw new HttpError(400, "invalid_transaction_date");
  }

  return raw;
}

function monthlyExpensePeriodFromDate(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return sanitizeMonthlyExpensePeriod(year, month);
}

function sanitizeOptionalText(value: unknown, maxLength: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + offset;
  return {
    year: Math.floor(zeroBased / 12),
    month: zeroBased % 12 + 1
  };
}

export function serializeMonthlyExpenseCsv(rows: Array<Record<string, string>>): string {
  const headers = ["descricao", "categoria", "valor_total", "numero_parcelas", "parcela_atual", "metodo_pagamento", "tipo"];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] || "")).join(","))
  ];

  return `${lines.join("\n")}\n`;
}

export function parseMonthlyExpenseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells.map((value) => value.trim());
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function normalizeMonthlyExpenseCsvRow(row: Record<string, string>) {
  const descricao = (row["descricao"] || "").trim();
  const categoria = (row["categoria"] || "").trim();
  const metodoPagamento = (row["metodo_pagamento"] || "").trim();
  const tipo = sanitizeMonthlyExpenseType((row["tipo"] || "").trim().toUpperCase());
  const numeroParcelas = Number(row["numero_parcelas"] || 1);
  const parcelaAtual = Number(row["parcela_atual"] || 1);
  const totalPurchaseCents = parseCsvMoney(row["valor_total"] || "");

  if (!descricao) {
    throw new HttpError(400, "descricao_obrigatoria");
  }

  if (!categoria) {
    throw new HttpError(400, "categoria_obrigatoria");
  }

  if (!metodoPagamento) {
    throw new HttpError(400, "metodo_pagamento_obrigatorio");
  }

  if (!Number.isInteger(numeroParcelas) || numeroParcelas <= 0 || numeroParcelas > 120) {
    throw new HttpError(400, "numero_parcelas_invalido");
  }

  if (!Number.isInteger(parcelaAtual) || parcelaAtual <= 0 || parcelaAtual > numeroParcelas) {
    throw new HttpError(400, "parcela_atual_invalida");
  }

  return {
    descricao,
    categoria,
    valor_total: row["valor_total"],
    totalPurchaseCents,
    numero_parcelas: numeroParcelas,
    parcela_atual: parcelaAtual,
    metodo_pagamento: metodoPagamento,
    tipo
  };
}

function parseCsvMoney(value: string): number {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, "valor_total_invalido");
  }

  return Math.round(parsed * 100);
}

function formatCsvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function normalizeCatalogKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function monthlyExpenseDuplicateKey(input: {
  description: string;
  totalPurchaseCents: number;
  installmentNumber: number;
  installmentTotal: number;
  expenseType: MonthlyExpenseType;
  categoryName: string;
  paymentMethodName: string;
}): string {
  return [
    input.description.trim().toLocaleLowerCase("pt-BR"),
    input.totalPurchaseCents,
    input.installmentNumber,
    input.installmentTotal,
    input.expenseType,
    normalizeCatalogKey(input.categoryName),
    normalizeCatalogKey(input.paymentMethodName)
  ].join("|");
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
      SELECT p.id, p.room_id, p.user_id, p.name, u.picture, p.kind, p.role, p.created_at, p.updated_at
      FROM expense_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND p.room_id = ?
      LIMIT 1
    `,
    args: [participantId, roomId]
  });

  return (result.rows[0] as unknown as ExpenseParticipantRow | undefined) || null;
}

async function listExpenseParticipants(db: Client, roomId: string): Promise<ExpenseParticipantRow[]> {
  const result = await db.execute({
    sql: `
      SELECT p.id, p.room_id, p.user_id, p.name, u.picture, p.kind, p.role, p.created_at, p.updated_at
      FROM expense_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.room_id = ?
      ORDER BY p.kind DESC, p.created_at ASC
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
      ORDER BY created_at ASC, id ASC
    `,
    args: [roomId]
  });

  return result.rows as unknown as ExpenseItemRow[];
}

async function listExpensePaidSettlements(db: Client, roomId: string): Promise<ExpensePaidSettlementRow[]> {
  const result = await db.execute({
    sql: `
      SELECT room_id, from_participant_id, to_participant_id, amount_cents, paid_at, paid_by_user_id
      FROM expense_paid_settlements
      WHERE room_id = ?
    `,
    args: [roomId]
  });

  return result.rows as unknown as ExpensePaidSettlementRow[];
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
  const participants = await listExpenseParticipants(db, roomId);
  const validParticipants = new Set(participants.map((participant) => participant.id));

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

async function clearPaidSettlements(db: Client, roomId: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM expense_paid_settlements WHERE room_id = ?",
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

export function calculateParticipantTotals(
  participantIds: string[],
  items: Array<{ splits: CalculatedSplit[] }>
): ParticipantTotal[] {
  const totals = participantIds.map((participantId) => ({
    participantId,
    subtotalCents: 0,
    totalCents: 0
  }));
  const byParticipant = new Map(totals.map((total) => [total.participantId, total]));

  for (const item of items) {
    for (const split of item.splits) {
      const total = byParticipant.get(split.participantId);
      if (total) {
        total.subtotalCents += split.amountCents;
      }
    }
  }

  for (const total of totals) {
    total.totalCents = total.subtotalCents;
  }

  return totals;
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

function settlementKey(fromParticipantId: string, toParticipantId: string): string {
  return `${fromParticipantId}->${toParticipantId}`;
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

function mapExpenseRoom(row: ExpenseRoomRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function mapExpenseParticipant(row: ExpenseParticipantRow) {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    name: row.name,
    picture: row.picture,
    kind: row.kind,
    role: row.role,
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
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
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function toUtcIsoTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
}

function sanitizeRoomName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || "Nova divisão").slice(0, 120);
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

function generateShortcutToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `mexp_${base64UrlEncode(bytes)}`;
}

async function hashShortcutToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
    "http://playground.isumi.com.br",
    "https://playground.isumi.com.br",
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    ...parseAllowedOrigins(env.ALLOWED_ORIGIN)
  ]);

  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
