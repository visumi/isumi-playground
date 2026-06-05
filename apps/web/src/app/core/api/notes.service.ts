import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { CreateNoteRequest, Note, UpdateNoteRequest } from "./api.types";

@Injectable({ providedIn: "root" })
export class NotesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tools/notes`;

  list(): Observable<Note[]> {
    return this.http.get<Note[]>(this.baseUrl);
  }

  create(payload: CreateNoteRequest): Observable<Note> {
    return this.http.post<Note>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateNoteRequest): Observable<Note> {
    return this.http.patch<Note>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
