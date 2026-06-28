import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { CreateExpenseRoomRequest, ExpenseRoomDetail, ExpenseRoomSummary, UpdateExpenseSettlementRequest, UpsertExpenseItemRequest, UpsertExpenseParticipantRequest } from "./api.types";

@Injectable({ providedIn: "root" })
export class ExpensesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tools/expenses/rooms`;

  listRooms(): Observable<ExpenseRoomSummary[]> {
    return this.http.get<ExpenseRoomSummary[]>(this.baseUrl);
  }

  createRoom(payload: CreateExpenseRoomRequest): Observable<ExpenseRoomDetail> {
    return this.http.post<ExpenseRoomDetail>(this.baseUrl, payload);
  }

  getRoom(roomId: string): Observable<ExpenseRoomDetail> {
    return this.http.get<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}`);
  }

  deleteRoom(roomId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}`);
  }

  acceptRoom(roomId: string): Observable<ExpenseRoomDetail> {
    return this.http.get<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}?accept=1`);
  }

  updateSettlement(roomId: string, payload: UpdateExpenseSettlementRequest): Observable<ExpenseRoomDetail> {
    return this.http.patch<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}/settlements`, payload);
  }

  createGuest(roomId: string, payload: UpsertExpenseParticipantRequest): Observable<ExpenseRoomDetail> {
    return this.http.post<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}/participants`, payload);
  }

  updateGuest(roomId: string, participantId: string, payload: UpsertExpenseParticipantRequest): Observable<ExpenseRoomDetail> {
    return this.http.patch<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}/participants/${participantId}`, payload);
  }

  deleteParticipant(roomId: string, participantId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/participants/${participantId}`);
  }

  createItem(roomId: string, payload: UpsertExpenseItemRequest): Observable<ExpenseRoomDetail> {
    return this.http.post<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}/items`, payload);
  }

  updateItem(roomId: string, itemId: string, payload: UpsertExpenseItemRequest): Observable<ExpenseRoomDetail> {
    return this.http.patch<ExpenseRoomDetail>(`${this.baseUrl}/${roomId}/items/${itemId}`, payload);
  }

  deleteItem(roomId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/items/${itemId}`);
  }
}
