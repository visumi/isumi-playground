import {
  authenticate,
  createAccessGrant,
  listAccessGrants,
  requireOwner,
  resolveAuthenticatedUser,
  updateAccessGrant,
  upsertUser,
  type AccessGrantInput,
  type AccessGrantPatchInput
} from "./access";
import {
  assertExpenseParticipantCanBeDeleted,
  calculateBalances,
  calculateItemSplits,
  calculateParticipantTotals,
  createExpenseItem,
  createExpenseRoom,
  createGuestParticipant,
  deleteExpenseItem,
  deleteExpenseParticipant,
  deleteExpenseRoom,
  getExpenseRoomDetail,
  listExpenseRooms,
  optimizeSettlements,
  updateExpenseItem,
  updateExpensePaidSettlement,
  updateGuestParticipant,
  type ExpenseItemInput,
  type ExpensePaidSettlementInput,
  type ExpenseParticipantInput
} from "./expense-rooms";
import {
  approveMonthlyExpensePendingItem,
  createMonthlyExpenseCategory,
  createMonthlyExpenseIngestToken,
  createMonthlyExpenseItem,
  createMonthlyExpenseMonth,
  createMonthlyExpensePaymentMethod,
  createMonthlyExpensePendingFromShortcut,
  deleteMonthlyExpenseItem,
  dismissMonthlyExpensePendingItem,
  exportMonthlyExpenseCsv,
  getMonthlyExpenseIngestTokenStatus,
  getMonthlyExpenseMonthDetail,
  importMonthlyExpenseCsv,
  migrateMonthlyFixedExpensesToNextMonth,
  listMonthlyExpenseCategories,
  listMonthlyExpenseMonths,
  listMonthlyExpensePaymentMethods,
  listMonthlyExpensePendingItems,
  revokeMonthlyExpenseIngestToken,
  updateMonthlyExpenseCategory,
  updateMonthlyExpenseItem,
  updateMonthlyExpenseMonthSettings,
  updateMonthlyExpensePaymentMethod,
  type MonthlyExpenseCatalogInput,
  type MonthlyExpenseCsvImportInput,
  type MonthlyExpenseItemInput,
  type MonthlyExpenseMonthInput,
  type MonthlyExpenseMonthSettingsInput,
  type MonthlyExpensePendingApproveInput,
  type MonthlyExpenseShortcutPendingInput
} from "./monthly-expenses";
import { createDatabaseClient, Env, HttpError } from "./shared";

export { isEmailAllowed, normalizeEmail, resolveAccessDecision } from "./access";
export {
  assertExpenseParticipantCanBeDeleted,
  calculateBalances,
  calculateItemSplits,
  calculateParticipantTotals,
  optimizeSettlements
} from "./expense-rooms";
export type { Env } from "./shared";
export {
  calculateMonthlyExpenseSummary,
  migrateMonthlyFixedExpensesToNextMonth,
  parseMonthlyExpenseCsv,
  parseShortcutMoneyAmount,
  sanitizeMonthlyExpenseShortcutPendingInput,
  serializeMonthlyExpenseCsv,
  splitInstallmentAmounts
} from "./monthly-expenses";
export type { MonthlyExpenseMonthRow } from "./monthly-expenses";


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

    if (request.method === "POST" && url.pathname === "/tools/monthly-expenses/apple-pay/pending") {
      const db = createDatabaseClient(env);
      const payload = await readJson<MonthlyExpenseShortcutPendingInput>(request);
      return json(await createMonthlyExpensePendingFromShortcut(db, request, payload), 201, corsHeaders);
    }

    const identity = await authenticate(request, env);
    const db = createDatabaseClient(env);
    const user = await resolveAuthenticatedUser(db, identity, env);

    if (request.method === "GET" && url.pathname === "/me") {
      return json(user, 200, corsHeaders);
    }

    if (!user.allowed) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    await upsertUser(db, user);

    if (url.pathname === "/admin/access-users") {
      requireOwner(user);

      if (request.method === "GET") {
        return json(await listAccessGrants(db, env), 200, corsHeaders);
      }

      if (request.method === "POST") {
        const payload = await readJson<AccessGrantInput>(request);
        return json(await createAccessGrant(db, user, env, payload), 201, corsHeaders);
      }
    }

    const accessGrantMatch = url.pathname.match(/^\/admin\/access-users\/([^/]+)$/);
    if (accessGrantMatch && request.method === "PATCH") {
      requireOwner(user);
      const payload = await readJson<AccessGrantPatchInput>(request);
      return json(await updateAccessGrant(db, env, accessGrantMatch[1], payload), 200, corsHeaders);
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


