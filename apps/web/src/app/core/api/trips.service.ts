import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  CreateTripLodgingRequest,
  CreateTripRequest,
  PublicTripSnapshot,
  TripRoomSummary,
  TripSnapshot,
  UpdateTripLodgingRequest,
  UpdateTripDayItemOrderRequest,
  UpsertTripDayItemRequest,
  UpsertTripPlaceRequest,
  UpsertTripRouteRequest
} from "./api.types";

@Injectable({ providedIn: "root" })
export class TripsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tools/trips`;

  list(): Observable<TripRoomSummary[]> {
    return this.http.get<TripRoomSummary[]>(this.baseUrl);
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

  createItem(roomId: string, payload: UpsertTripDayItemRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/items`, payload);
  }

  updateItem(roomId: string, itemId: string, payload: UpsertTripDayItemRequest): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}/items/${itemId}`, payload);
  }

  deleteItem(roomId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/items/${itemId}`);
  }

  reorderDayItems(roomId: string, dayId: string, payload: UpdateTripDayItemOrderRequest): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}/days/${dayId}/items/order`, payload);
  }

  createRoute(roomId: string, payload: UpsertTripRouteRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/routes`, payload);
  }

  updateRoute(roomId: string, routeId: string, payload: UpsertTripRouteRequest): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}/routes/${routeId}`, payload);
  }

  deleteRoute(roomId: string, routeId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${roomId}/routes/${routeId}`);
  }

  createLodging(roomId: string, payload: CreateTripLodgingRequest): Observable<TripSnapshot> {
    return this.http.post<TripSnapshot>(`${this.baseUrl}/${roomId}/lodgings`, payload);
  }

  updateLodging(roomId: string, lodgingId: string, payload: UpdateTripLodgingRequest): Observable<TripSnapshot> {
    return this.http.patch<TripSnapshot>(`${this.baseUrl}/${roomId}/lodgings/${lodgingId}`, payload);
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

  ensurePublicShareToken(roomId: string): Observable<{ publicShareToken: string }> {
    return this.http.post<{ publicShareToken: string }>(
      `${this.baseUrl}/${roomId}/public-share-token`,
      {}
    );
  }

  publicSnapshot(shareToken: string): Observable<PublicTripSnapshot> {
    return this.http.get<PublicTripSnapshot>(`${this.baseUrl}/public/${shareToken}`);
  }
}
