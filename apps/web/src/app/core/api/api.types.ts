export interface MeResponse {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  allowed: boolean;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  title: string;
  body: string;
}

export type UpdateNoteRequest = Partial<CreateNoteRequest>;

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
}

export interface ExpenseRoomDetail {
  room: ExpenseRoom;
  participants: ExpenseParticipant[];
  items: ExpenseItem[];
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
