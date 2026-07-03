import { type Client, type InStatement } from "@libsql/client/web";
import { executeStatementsAtomically, HttpError, mapDbRows, readDbNumber, readDbString, toUtcIsoTimestamp, type DbRow } from "./shared";

export type MonthlyExpenseType = "FIXO" | "VARIAVEL" | "RESERVA";

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

export interface MonthlyExpenseMonthInput {
  year?: number;
  month?: number;
}

export interface MonthlyExpenseMonthSettingsInput {
  incomeCents?: number;
  variableLimitCents?: number;
}

export interface MonthlyExpenseCatalogInput {
  name?: string;
  color?: string;
  archived?: boolean;
}

export interface MonthlyExpenseItemInput {
  description?: string;
  categoryId?: string;
  paymentMethodId?: string;
  totalPurchaseCents?: number;
  installmentTotal?: number;
  expenseType?: MonthlyExpenseType;
}

export interface MonthlyExpenseCsvImportInput {
  csv?: string;
}

export interface MonthlyExpenseShortcutPendingInput {
  merchant?: string;
  amount?: string;
  sourceId?: string;
}

export interface MonthlyExpensePendingApproveInput {
  description?: string;
  categoryId?: string;
  paymentMethodId?: string;
  installmentTotal?: number;
  expenseType?: MonthlyExpenseType;
}

const shortcutTransactionTimeZone = "America/Sao_Paulo";
const maxCsvImportBytes = 256 * 1024;
const maxCsvImportRows = 1_000;
const maxShortcutPayloadBytes = 4 * 1024;

export async function listMonthlyExpenseMonths(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT id, user_id, year, month, income_cents, variable_limit_cents, created_at, updated_at
      FROM monthly_expense_months
      WHERE user_id = ?
      ORDER BY year DESC, month DESC
    `,
    args: [userId]
  });

  return mapDbRows(result.rows, mapMonthlyExpenseMonthRow).map(mapMonthlyExpenseMonth);
}

export async function createMonthlyExpenseMonth(db: Client, userId: string, payload: MonthlyExpenseMonthInput) {
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

export async function getMonthlyExpenseMonthDetail(db: Client, userId: string, monthId: string) {
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

export async function updateMonthlyExpenseMonthSettings(db: Client, userId: string, monthId: string, payload: MonthlyExpenseMonthSettingsInput) {
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

export async function listMonthlyExpenseCategories(db: Client, userId: string) {
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

export async function createMonthlyExpenseCategory(db: Client, userId: string, payload: MonthlyExpenseCatalogInput) {
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

export async function updateMonthlyExpenseCategory(db: Client, userId: string, categoryId: string, payload: MonthlyExpenseCatalogInput) {
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

export async function listMonthlyExpensePaymentMethods(db: Client, userId: string) {
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

export async function createMonthlyExpensePaymentMethod(db: Client, userId: string, payload: MonthlyExpenseCatalogInput) {
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

export async function updateMonthlyExpensePaymentMethod(db: Client, userId: string, methodId: string, payload: MonthlyExpenseCatalogInput) {
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

export async function createMonthlyExpenseItem(db: Client, userId: string, monthId: string, payload: MonthlyExpenseItemInput) {
  const { statements } = await prepareMonthlyExpenseItemInsertStatements(db, userId, monthId, payload);
  await executeStatementsAtomically(db, statements);

  return getMonthlyExpenseMonthDetail(db, userId, monthId);
}

async function prepareMonthlyExpenseItemInsertStatements(db: Client, userId: string, monthId: string, payload: MonthlyExpenseItemInput) {
  const month = await assertMonthlyExpenseMonth(db, userId, monthId);
  const item = await sanitizeMonthlyExpenseItemInput(db, userId, payload);
  const installmentAmounts = splitInstallmentAmounts(item.totalPurchaseCents, item.installmentTotal);
  const groupId = crypto.randomUUID();
  const statements: InStatement[] = [];

  for (let index = 0; index < item.installmentTotal; index += 1) {
    const target = addMonths(month.year, month.month, index);
    const targetMonth = index === 0
      ? month
      : await ensureMonthlyExpenseMonthByPeriod(db, userId, target.year, target.month);

    statements.push(monthlyExpenseItemInsertStatement(userId, targetMonth.id, {
      ...item,
      amountCents: installmentAmounts[index],
      installmentNumber: index + 1,
      installmentGroupId: groupId
    }));
  }

  return { month, statements };
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

export async function updateMonthlyExpenseItem(db: Client, userId: string, monthId: string, itemId: string, payload: MonthlyExpenseItemInput) {
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

export async function deleteMonthlyExpenseItem(db: Client, userId: string, monthId: string, itemId: string): Promise<void> {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  await db.execute({
    sql: "DELETE FROM monthly_expense_items WHERE id = ? AND user_id = ? AND month_id = ?",
    args: [itemId, userId, monthId]
  });
}

export async function exportMonthlyExpenseCsv(db: Client, userId: string, monthId: string): Promise<string> {
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

export async function importMonthlyExpenseCsv(db: Client, userId: string, monthId: string, payload: MonthlyExpenseCsvImportInput) {
  await assertMonthlyExpenseMonth(db, userId, monthId);
  const csv = typeof payload.csv === "string" ? payload.csv : "";
  assertMonthlyExpenseCsvImportLimits(csv);
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

  await executeStatementsAtomically(db, validRows.map((row) => monthlyExpenseItemInsertStatement(userId, monthId, {
      description: row.descricao,
      categoryId: row.categoryId,
      paymentMethodId: row.paymentMethodId,
      totalPurchaseCents: row.totalPurchaseCents,
      amountCents: splitInstallmentAmounts(row.totalPurchaseCents, row.numero_parcelas)[row.parcela_atual - 1],
      installmentNumber: row.parcela_atual,
      installmentTotal: row.numero_parcelas,
      expenseType: row.tipo,
      installmentGroupId: crypto.randomUUID()
    })));

  return { imported: validRows.length, errors: [], detail: await getMonthlyExpenseMonthDetail(db, userId, monthId) };
}

export async function getMonthlyExpenseIngestTokenStatus(db: Client, userId: string) {
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

export async function createMonthlyExpenseIngestToken(db: Client, userId: string) {
  const token = generateShortcutToken();
  const tokenHash = await hashShortcutToken(token);
  const tokenId = crypto.randomUUID();

  await executeStatementsAtomically(db, [
    {
      sql: `
        UPDATE monthly_expense_ingest_tokens
        SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
      `,
      args: [userId]
    },
    {
      sql: `
        INSERT INTO monthly_expense_ingest_tokens (id, user_id, token_hash, token_last4, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [tokenId, userId, tokenHash, token.slice(-4)]
    }
  ]);

  return {
    active: true,
    token,
    tokenLast4: token.slice(-4),
    lastUsedAt: null,
    createdAt: new Date().toISOString()
  };
}

export async function revokeMonthlyExpenseIngestToken(db: Client, userId: string): Promise<void> {
  await db.execute({
    sql: `
      UPDATE monthly_expense_ingest_tokens
      SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revoked_at IS NULL
    `,
    args: [userId]
  });
}

export async function createMonthlyExpensePendingFromShortcut(db: Client, request: Request, payload: MonthlyExpenseShortcutPendingInput) {
  const token = await authenticateMonthlyExpenseShortcutToken(db, request);
  const input = sanitizeMonthlyExpenseShortcutPendingInput(payload);
  const existing = input.sourceId ? await findMonthlyExpensePendingBySource(db, token.user_id, input.sourceId) : null;

  if (existing) {
    return { pending: mapMonthlyExpensePendingItem(existing), duplicate: true };
  }

  const period = monthlyExpensePeriodFromDate(input.transactionDate);
  const month = await ensureMonthlyExpenseMonthByPeriod(db, token.user_id, period.year, period.month);
  const pendingId = crypto.randomUUID();

  await executeStatementsAtomically(db, [
    touchMonthlyExpenseIngestTokenStatement(token.id),
    {
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
    }
  ]);

  const created = await findMonthlyExpensePendingItem(db, token.user_id, month.id, pendingId, { includeClosed: true });
  if (!created) {
    throw new HttpError(500, "monthly_expense_pending_create_failed");
  }

  return { pending: mapMonthlyExpensePendingItem(created), duplicate: false };
}

function touchMonthlyExpenseIngestTokenStatement(tokenId: string): InStatement {
  return {
    sql: "UPDATE monthly_expense_ingest_tokens SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [tokenId]
  };
}

export async function listMonthlyExpensePendingItems(db: Client, userId: string, monthId: string) {
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

export async function approveMonthlyExpensePendingItem(
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

  const { statements } = await prepareMonthlyExpenseItemInsertStatements(db, userId, monthId, {
    description: typeof payload.description === "string" && payload.description.trim()
      ? payload.description
      : pending.merchant_name || pending.description,
    categoryId: payload.categoryId,
    paymentMethodId: payload.paymentMethodId,
    totalPurchaseCents: pending.amount_cents,
    installmentTotal: payload.installmentTotal,
    expenseType: payload.expenseType
  });

  await executeStatementsAtomically(db, [
    ...statements,
    {
      sql: `
        UPDATE monthly_expense_pending_items
        SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND month_id = ? AND status = 'PENDING'
      `,
      args: [pendingId, userId, monthId]
    }
  ]);

  return getMonthlyExpenseMonthDetail(db, userId, monthId);
}

export async function dismissMonthlyExpensePendingItem(db: Client, userId: string, monthId: string, pendingId: string): Promise<void> {
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

  const insertStatements: InStatement[] = [];

  for (const item of sourceItems.filter(isSimpleMonthlyFixedExpense)) {
    const key = monthlyExpenseSimpleFixedKey(item);
    if (targetKeys.has(key)) {
      continue;
    }

    insertStatements.push(monthlyExpenseItemInsertStatement(userId, targetMonthId, {
      description: item.description,
      categoryId: item.category_id,
      paymentMethodId: item.payment_method_id,
      totalPurchaseCents: item.total_purchase_cents,
      amountCents: item.amount_cents,
      installmentNumber: 1,
      installmentTotal: 1,
      expenseType: "FIXO",
      installmentGroupId: crypto.randomUUID()
    }));
    targetKeys.add(key);
    copied += 1;
  }

  await executeStatementsAtomically(db, insertStatements);

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
  await db.execute(monthlyExpenseItemInsertStatement(userId, monthId, item));
}

function monthlyExpenseItemInsertStatement(
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
): InStatement {
  return {
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
  };
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

function mapMonthlyExpenseMonthRow(row: DbRow): MonthlyExpenseMonthRow {
  return {
    id: readDbString(row, "id"),
    user_id: readDbString(row, "user_id"),
    year: readDbNumber(row, "year"),
    month: readDbNumber(row, "month"),
    income_cents: readDbNumber(row, "income_cents"),
    variable_limit_cents: readDbNumber(row, "variable_limit_cents"),
    created_at: readDbString(row, "created_at"),
    updated_at: readDbString(row, "updated_at")
  };
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
    sourceId: sanitizeShortcutSourceId(payload.sourceId)
  };
}

function assertExactShortcutPayload(payload: MonthlyExpenseShortcutPendingInput): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "invalid_shortcut_payload");
  }

  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > maxShortcutPayloadBytes) {
    throw new HttpError(413, "shortcut_payload_too_large");
  }

  const keys = Object.keys(payload).sort();
  const allowedKeys = new Set(["amount", "merchant", "sourceId"]);
  if (
    !keys.every((key) => allowedKeys.has(key))
    || !keys.includes("amount")
    || !keys.includes("merchant")
  ) {
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

function sanitizeShortcutSourceId(value: unknown): string | null {
  const sourceId = sanitizeOptionalText(value, 128);
  if (!sourceId) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(sourceId)) {
    throw new HttpError(400, "invalid_source_id");
  }
  return sourceId;
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

function assertMonthlyExpenseCsvImportLimits(csv: string): void {
  if (new TextEncoder().encode(csv).byteLength > maxCsvImportBytes) {
    throw new HttpError(413, "csv_too_large");
  }

  const rowCount = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0).length - 1;
  if (rowCount > maxCsvImportRows) {
    throw new HttpError(413, "csv_too_many_rows");
  }
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
