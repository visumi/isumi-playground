import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  CreateMonthlyExpenseMonthRequest,
  MonthlyExpenseCatalogItem,
  MonthlyExpenseCsvImportResponse,
  MonthlyExpenseDetail,
  MonthlyExpenseMonth,
  UpdateMonthlyExpenseMonthRequest,
  UpsertMonthlyExpenseCatalogItemRequest,
  UpsertMonthlyExpenseItemRequest
} from "./api.types";

@Injectable({ providedIn: "root" })
export class MonthlyExpensesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tools/monthly-expenses`;

  listMonths(): Observable<MonthlyExpenseMonth[]> {
    return this.http.get<MonthlyExpenseMonth[]>(`${this.baseUrl}/months`);
  }

  createMonth(payload: CreateMonthlyExpenseMonthRequest): Observable<MonthlyExpenseDetail> {
    return this.http.post<MonthlyExpenseDetail>(`${this.baseUrl}/months`, payload);
  }

  getMonth(monthId: string): Observable<MonthlyExpenseDetail> {
    return this.http.get<MonthlyExpenseDetail>(`${this.baseUrl}/months/${monthId}`);
  }

  updateMonth(monthId: string, payload: UpdateMonthlyExpenseMonthRequest): Observable<MonthlyExpenseDetail> {
    return this.http.patch<MonthlyExpenseDetail>(`${this.baseUrl}/months/${monthId}`, payload);
  }

  listCategories(): Observable<MonthlyExpenseCatalogItem[]> {
    return this.http.get<MonthlyExpenseCatalogItem[]>(`${this.baseUrl}/categories`);
  }

  createCategory(payload: UpsertMonthlyExpenseCatalogItemRequest): Observable<MonthlyExpenseCatalogItem[]> {
    return this.http.post<MonthlyExpenseCatalogItem[]>(`${this.baseUrl}/categories`, payload);
  }

  updateCategory(categoryId: string, payload: UpsertMonthlyExpenseCatalogItemRequest): Observable<MonthlyExpenseCatalogItem[]> {
    return this.http.patch<MonthlyExpenseCatalogItem[]>(`${this.baseUrl}/categories/${categoryId}`, payload);
  }

  listPaymentMethods(): Observable<MonthlyExpenseCatalogItem[]> {
    return this.http.get<MonthlyExpenseCatalogItem[]>(`${this.baseUrl}/payment-methods`);
  }

  createPaymentMethod(payload: UpsertMonthlyExpenseCatalogItemRequest): Observable<MonthlyExpenseCatalogItem[]> {
    return this.http.post<MonthlyExpenseCatalogItem[]>(`${this.baseUrl}/payment-methods`, payload);
  }

  updatePaymentMethod(methodId: string, payload: UpsertMonthlyExpenseCatalogItemRequest): Observable<MonthlyExpenseCatalogItem[]> {
    return this.http.patch<MonthlyExpenseCatalogItem[]>(`${this.baseUrl}/payment-methods/${methodId}`, payload);
  }

  createItem(monthId: string, payload: UpsertMonthlyExpenseItemRequest): Observable<MonthlyExpenseDetail> {
    return this.http.post<MonthlyExpenseDetail>(`${this.baseUrl}/months/${monthId}/items`, payload);
  }

  updateItem(monthId: string, itemId: string, payload: UpsertMonthlyExpenseItemRequest): Observable<MonthlyExpenseDetail> {
    return this.http.patch<MonthlyExpenseDetail>(`${this.baseUrl}/months/${monthId}/items/${itemId}`, payload);
  }

  deleteItem(monthId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/months/${monthId}/items/${itemId}`);
  }

  exportCsv(monthId: string): Observable<string> {
    return this.http.get(`${this.baseUrl}/months/${monthId}/csv`, { responseType: "text" });
  }

  importCsv(monthId: string, csv: string): Observable<MonthlyExpenseCsvImportResponse> {
    return this.http.post<MonthlyExpenseCsvImportResponse>(
      `${this.baseUrl}/months/${monthId}/csv`,
      { csv },
      { headers: new HttpHeaders({ "Content-Type": "application/json" }) }
    );
  }
}
