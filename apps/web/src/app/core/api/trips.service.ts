import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  CreateTripFlightRequest,
  CreateTripLodgingRequest,
  CreateTripRequest,
  TripRoom,
  TripSnapshot,
  UpsertTripDayItemRequest,
  UpsertTripPlaceRequest
} from "./api.types";

@Injectable({ providedIn: "root" })
export class TripsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tools/trips`;

  list(): Observable<TripRoom[]> {
    return this.http.get<TripRoom[]>(this.baseUrl);
  }

  create(payload: CreateTripRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(this.baseUrl, payload);
  }

  get(roomId: string): Observable<TripSnapshot> {
    return this.http.get<TripSnapshot>(`${this.baseUrl}/${roomId}`);
  }

  update(roomId: string, payload: Partial<CreateTripRequest>): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}`, payload);
  }

  delete(roomId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}`);
  }

  createPlace(roomId: string, payload: UpsertTripPlaceRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/places`, payload);
  }

  updatePlace(roomId: string, placeId: string, payload: UpsertTripPlaceRequest): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}/places/${placeId}`, payload);
  }

  deletePlace(roomId: string, placeId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/places/${placeId}`);
  }

  uploadPlaceImage(roomId: string, placeId: string, image: Blob): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${roomId}/places/${placeId}/image`, image, {
      headers: { "Content-Type": "image/webp" }
    });
  }

  imageUrl(roomId: string, placeId: string): string {
    return `${this.baseUrl}/${roomId}/places/${placeId}/image`;
  }

  getPlaceImage(roomId: string, placeId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${roomId}/places/${placeId}/image`, {
      responseType: "blob"
    });
  }

  createItem(roomId: string, payload: UpsertTripDayItemRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/items`, payload);
  }

  updateItem(roomId: string, itemId: string, payload: UpsertTripDayItemRequest): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}/items/${itemId}`, payload);
  }

  deleteItem(roomId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/items/${itemId}`);
  }

  createFlight(roomId: string, payload: CreateTripFlightRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/flights`, payload);
  }

  deleteFlight(roomId: string, flightId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/flights/${flightId}`);
  }

  createLodging(roomId: string, payload: CreateTripLodgingRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/lodgings`, payload);
  }

  deleteLodging(roomId: string, lodgingId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/lodgings/${lodgingId}`);
  }

  acceptRoom(roomId: string): Observable<TripSnapshot> {
    return this.http.get<TripSnapshot>(`${this.baseUrl}/${roomId}?accept=1`);
  }

  realtimeTicket(roomId: string): Observable<{ token: string; expiresInSeconds: number }> {
    return this.http.post<{ token: string; expiresInSeconds: number }>(
      `${this.baseUrl}/${roomId}/realtime-ticket`,
      {}
    );
  }

  realtimeUrl(roomId: string, ticket: string): string {
    const url = new URL(`${this.baseUrl}/${roomId}/realtime`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    return url.toString();
  }
}
