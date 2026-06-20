import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { AccessUser, CreateAccessUserRequest, UpdateAccessUserRequest } from "./api.types";

@Injectable({ providedIn: "root" })
export class AccessService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/admin/access-users`;

  listUsers(): Observable<AccessUser[]> {
    return this.http.get<AccessUser[]>(this.baseUrl);
  }

  createUser(payload: CreateAccessUserRequest): Observable<AccessUser> {
    return this.http.post<AccessUser>(this.baseUrl, payload);
  }

  updateUser(email: string, payload: UpdateAccessUserRequest): Observable<AccessUser> {
    return this.http.patch<AccessUser>(`${this.baseUrl}/${encodeURIComponent(email)}`, payload);
  }
}
