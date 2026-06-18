export interface MeResponse {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  allowed: boolean;
}

export interface ExpenseRoom {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseParticipant {
  id: string;
  roomId: string;
  userId: string | null;
  name: string;
  picture: string | null;
  kind: "user" | "guest";
  role: "owner" | "member" | "guest";
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseItemSplit {
  participantId: string;
  shareUnits: number;
  amountCents: number;
}

export interface ExpenseItem {
  id: string;
  roomId: string;
  payerParticipantId: string;
  description: string;
  amountCents: number;
  createdByUserId: string;
  splits: ExpenseItemSplit[];
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseBalance {
  participantId: string;
  balanceCents: number;
}

export interface ExpenseSettlement {
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  paid: boolean;
  paidAt?: string;
  paidByUserId?: string;
}

export interface ExpenseParticipantTotal {
  participantId: string;
  subtotalCents: number;
  totalCents: number;
}

export interface ExpenseRoomDetail {
  room: ExpenseRoom;
  subtotalCents: number;
  totalCents: number;
  participants: ExpenseParticipant[];
  items: ExpenseItem[];
  participantTotals: ExpenseParticipantTotal[];
  balances: ExpenseBalance[];
  settlements: ExpenseSettlement[];
}

export interface CreateExpenseRoomRequest {
  name: string;
}

export interface UpsertExpenseParticipantRequest {
  name: string;
}

export interface UpsertExpenseItemRequest {
  description: string;
  amountCents: number;
  payerParticipantId: string;
  splits: Array<{
    participantId: string;
    shareUnits: number;
  }>;
}

export interface UpdateExpenseSettlementRequest {
  fromParticipantId: string;
  toParticipantId: string;
  paid: boolean;
}

export type MonthlyExpenseType = "FIXO" | "VARIAVEL" | "RESERVA";

export interface MonthlyExpenseMonth {
  id: string;
  userId: string;
  year: number;
  month: number;
  incomeCents: number;
  variableLimitCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyExpenseCatalogItem {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyExpenseItem {
  id: string;
  monthId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodColor: string;
  description: string;
  amountCents: number;
  totalPurchaseCents: number;
  installmentNumber: number;
  installmentTotal: number;
  expenseType: MonthlyExpenseType;
  installmentGroupId: string;
  createdAt: string;
  updatedAt: string;
}

export type MonthlyExpensePendingStatus = "PENDING" | "APPROVED" | "DISMISSED";

export interface MonthlyExpensePendingItem {
  id: string;
  monthId: string;
  merchantName: string;
  amount: number;
  transactionDate: string;
  sourceId: string | null;
  status: MonthlyExpensePendingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyExpenseIngestTokenStatus {
  active: boolean;
  tokenLast4?: string;
  token?: string;
  lastUsedAt?: string | null;
  createdAt?: string;
}

export interface MonthlyExpenseSummary {
  incomeCents: number;
  variableLimitCents: number;
  variableSpentCents: number;
  variableRemainingCents: number;
  fixedTotalCents: number;
  reserveTotalCents: number;
  monthTotalCents: number;
  unallocatedCents: number;
}

export interface MonthlyExpenseDetail {
  month: MonthlyExpenseMonth;
  summary: MonthlyExpenseSummary;
  categories: MonthlyExpenseCatalogItem[];
  paymentMethods: MonthlyExpenseCatalogItem[];
  items: MonthlyExpenseItem[];
}

export interface CreateMonthlyExpenseMonthRequest {
  year: number;
  month: number;
}

export interface UpdateMonthlyExpenseMonthRequest {
  incomeCents: number;
  variableLimitCents: number;
}

export interface UpsertMonthlyExpenseCatalogItemRequest {
  name: string;
  color: string;
  archived?: boolean;
}

export interface UpsertMonthlyExpenseItemRequest {
  description: string;
  categoryId: string;
  paymentMethodId: string;
  totalPurchaseCents: number;
  installmentTotal: number;
  expenseType: MonthlyExpenseType;
}

export interface ApproveMonthlyExpensePendingItemRequest {
  description?: string;
  categoryId: string;
  paymentMethodId: string;
  installmentTotal: number;
  expenseType: MonthlyExpenseType;
}

export interface MonthlyExpenseCsvImportResponse {
  imported: number;
  errors: Array<{ line: number; message: string }>;
  detail: MonthlyExpenseDetail;
}

export interface MonthlyExpenseFixedMigrationResponse {
  copied: number;
  detail: MonthlyExpenseDetail;
}
