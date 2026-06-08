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
  tipPercent: number;
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
  isEstablishment: boolean;
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
  tipAmountCents: number;
  totalCents: number;
}

export interface ExpenseRoomDetail {
  room: ExpenseRoom;
  tipPercent: number;
  subtotalCents: number;
  tipAmountCents: number;
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

export interface UpdateExpenseTipRequest {
  tipPercent: number;
}

export interface UpdateExpenseSettlementRequest {
  fromParticipantId: string;
  toParticipantId: string;
  paid: boolean;
}
