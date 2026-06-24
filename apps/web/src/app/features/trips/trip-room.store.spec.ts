import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { TripSnapshot } from "../../core/api/api.types";
import { TripRoomStore } from "./trip-room.store";

describe("TripRoomStore", () => {
  it("returns day items in timeline order", () => {
    TestBed.configureTestingModule({
      providers: [TripRoomStore, provideHttpClient(), provideHttpClientTesting()]
    });
    const store = TestBed.inject(TripRoomStore);
    store.setSnapshot({
      room: {
        id: "trip-1",
        ownerUserId: "owner",
        title: "Viagem",
        destination: "Destino",
        startDate: "2026-10-12",
        endDate: "2026-10-12",
        timezone: "UTC",
        revision: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      },
      currentMemberRole: "owner",
      members: [],
      days: [{ id: "day-1", date: "2026-10-12", position: 0 }],
      places: [],
      items: [
        {
          id: "later",
          dayId: "day-1",
          placeId: "place-2",
          position: 1,
          durationMinutes: 60,
          transportMode: null,
          transportMinutes: null,
          transportNotes: null,
          transportNeedsReview: false,
          version: 1
        },
        {
          id: "first",
          dayId: "day-1",
          placeId: "place-1",
          position: 0,
          durationMinutes: 30,
          transportMode: null,
          transportMinutes: null,
          transportNotes: null,
          transportNeedsReview: false,
          version: 1
        }
      ],
      flights: [],
      lodgings: []
    } satisfies TripSnapshot);

    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["first", "later"]);
  });
});
