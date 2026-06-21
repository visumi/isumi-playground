import { type Client, type InStatement } from "@libsql/client/web";
import { AuthUser, executeStatementsAtomically, HttpError, toUtcIsoTimestamp } from "./shared";

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

export interface ExpenseItemInput {
  description?: string;
  amountCents?: number;
  payerParticipantId?: string;
  splits?: ExpenseItemSplitInput[];
}

export interface ExpenseParticipantInput {
  name?: string;
}

export interface ExpensePaidSettlementInput {
  fromParticipantId?: string;
  toParticipantId?: string;
  paid?: boolean;
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

export async function listExpenseRooms(db: Client, userId: string) {
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

export async function createExpenseRoom(db: Client, user: AuthUser, payload: { name?: string }) {
  const roomId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const name = sanitizeRoomName(payload.name);
  const participantName = sanitizeParticipantName(user.name || user.email);

  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO expense_rooms (id, owner_user_id, name, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [roomId, user.uid, name]
    },
    {
      sql: `
        INSERT INTO expense_participants (id, room_id, user_id, name, kind, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'user', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [participantId, roomId, user.uid, participantName]
    }
  ]);

  return buildExpenseRoomDetail(db, roomId);
}

export async function updateExpensePaidSettlement(db: Client, userId: string, roomId: string, payload: ExpensePaidSettlementInput) {
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

export async function getExpenseRoomDetail(db: Client, user: AuthUser, roomId: string, acceptInvite = false) {
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

export async function deleteExpenseRoom(db: Client, userId: string, roomId: string): Promise<void> {
  await assertExpenseRoomOwner(db, roomId, userId);

  await executeStatementsAtomically(db, [
    {
      sql: `
        DELETE FROM expense_paid_settlements
        WHERE room_id = ?
      `,
      args: [roomId]
    },
    {
      sql: `
        DELETE FROM expense_item_splits
        WHERE item_id IN (
          SELECT id
          FROM expense_items
          WHERE room_id = ?
        )
      `,
      args: [roomId]
    },
    {
      sql: "DELETE FROM expense_items WHERE room_id = ?",
      args: [roomId]
    },
    {
      sql: "DELETE FROM expense_participants WHERE room_id = ?",
      args: [roomId]
    },
    {
      sql: "DELETE FROM expense_rooms WHERE id = ?",
      args: [roomId]
    }
  ]);
}

export async function createGuestParticipant(db: Client, userId: string, roomId: string, payload: ExpenseParticipantInput) {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participantId = crypto.randomUUID();

  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO expense_participants (id, room_id, user_id, name, kind, role, created_at, updated_at)
        VALUES (?, ?, NULL, ?, 'guest', 'guest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [participantId, roomId, sanitizeParticipantName(payload.name)]
    },
    touchExpenseRoomStatement(roomId)
  ]);

  return buildExpenseRoomDetail(db, roomId);
}

export async function updateGuestParticipant(db: Client, userId: string, roomId: string, participantId: string, payload: ExpenseParticipantInput) {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participant = await findExpenseParticipant(db, roomId, participantId);

  if (!participant) {
    throw new HttpError(404, "not_found");
  }

  if (participant.kind !== "guest") {
    throw new HttpError(403, "cannot_edit_user_participant");
  }

  await executeStatementsAtomically(db, [
    {
      sql: `
        UPDATE expense_participants
        SET name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND room_id = ?
      `,
      args: [sanitizeParticipantName(payload.name), participantId, roomId]
    },
    touchExpenseRoomStatement(roomId)
  ]);

  return buildExpenseRoomDetail(db, roomId);
}

export async function deleteExpenseParticipant(db: Client, userId: string, roomId: string, participantId: string): Promise<void> {
  await assertExpenseRoomOwner(db, roomId, userId);
  const participant = await findExpenseParticipant(db, roomId, participantId);

  if (!participant) {
    throw new HttpError(404, "not_found");
  }

  await assertExpenseParticipantCanBeDeleted(db, roomId, participant);

  await executeStatementsAtomically(db, [
    {
      sql: "DELETE FROM expense_participants WHERE id = ? AND room_id = ?",
      args: [participantId, roomId]
    },
    clearPaidSettlementsStatement(roomId),
    touchExpenseRoomStatement(roomId)
  ]);
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

export async function createExpenseItem(db: Client, userId: string, roomId: string, payload: ExpenseItemInput) {
  await assertExpenseRoomMember(db, roomId, userId);
  const itemId = crypto.randomUUID();
  const item = await sanitizeExpenseItemInput(db, roomId, payload);

  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO expense_items (id, room_id, payer_participant_id, description, amount_cents, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      args: [itemId, roomId, item.payerParticipantId, item.description, item.amountCents, userId]
    },
    ...replaceExpenseItemSplitsStatements(itemId, item.splits),
    clearPaidSettlementsStatement(roomId),
    touchExpenseRoomStatement(roomId)
  ]);

  return buildExpenseRoomDetail(db, roomId);
}

export async function updateExpenseItem(db: Client, userId: string, roomId: string, itemId: string, payload: ExpenseItemInput) {
  await assertExpenseRoomMember(db, roomId, userId);
  await assertExpenseItemExists(db, roomId, itemId);
  const item = await sanitizeExpenseItemInput(db, roomId, payload);

  await executeStatementsAtomically(db, [
    {
      sql: `
        UPDATE expense_items
        SET payer_participant_id = ?, description = ?, amount_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND room_id = ?
      `,
      args: [item.payerParticipantId, item.description, item.amountCents, itemId, roomId]
    },
    ...replaceExpenseItemSplitsStatements(itemId, item.splits),
    clearPaidSettlementsStatement(roomId),
    touchExpenseRoomStatement(roomId)
  ]);

  return buildExpenseRoomDetail(db, roomId);
}

export async function deleteExpenseItem(db: Client, userId: string, roomId: string, itemId: string): Promise<void> {
  await assertExpenseRoomMember(db, roomId, userId);
  await assertExpenseItemExists(db, roomId, itemId);

  await executeStatementsAtomically(db, [
    {
      sql: "DELETE FROM expense_items WHERE id = ? AND room_id = ?",
      args: [itemId, roomId]
    },
    clearPaidSettlementsStatement(roomId),
    touchExpenseRoomStatement(roomId)
  ]);
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
  const participantTotals = calculateParticipantTotals(participantIds, detailedItems);
  const balances = calculateBalances(participantIds, detailedItems);
  const paidByKey = new Map(paidSettlements.map((settlement) => [
    settlementKey(settlement.from_participant_id, settlement.to_participant_id),
    settlement
  ]));
  const settlements = optimizeSettlements(balances).map((settlement) => {
    const paid = paidByKey.get(settlementKey(settlement.fromParticipantId, settlement.toParticipantId));

    return {
      ...settlement,
      paid: Boolean(paid && paid.amount_cents === settlement.amountCents),
      paidAt: paid?.paid_at ? toUtcIsoTimestamp(paid.paid_at) : undefined,
      paidByUserId: paid?.paid_by_user_id
    };
  });
  const subtotalCents = detailedItems.reduce((sum, item) => sum + item.amountCents, 0);

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

  await executeStatementsAtomically(db, [
    {
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
    },
    touchExpenseRoomStatement(room.id)
  ]);
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
  await executeStatementsAtomically(db, replaceExpenseItemSplitsStatements(itemId, splits));
}

function replaceExpenseItemSplitsStatements(itemId: string, splits: Array<{ participantId: string; shareUnits: number }>): InStatement[] {
  return [
    {
      sql: "DELETE FROM expense_item_splits WHERE item_id = ?",
      args: [itemId]
    },
    ...splits.map((split) => ({
      sql: "INSERT INTO expense_item_splits (item_id, participant_id, share_units) VALUES (?, ?, ?)",
      args: [itemId, split.participantId, split.shareUnits]
    }))
  ];
}

async function touchExpenseRoom(db: Client, roomId: string): Promise<void> {
  await db.execute(touchExpenseRoomStatement(roomId));
}

function touchExpenseRoomStatement(roomId: string): InStatement {
  return {
    sql: "UPDATE expense_rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [roomId]
  };
}

async function clearPaidSettlements(db: Client, roomId: string): Promise<void> {
  await db.execute(clearPaidSettlementsStatement(roomId));
}

function clearPaidSettlementsStatement(roomId: string): InStatement {
  return {
    sql: "DELETE FROM expense_paid_settlements WHERE room_id = ?",
    args: [roomId]
  };
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
