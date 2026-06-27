import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { TripsService } from "./trips.service";

describe("TripsService", () => {
  let service: TripsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(TripsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("creates a trip with its date range and timezone", () => {
    service.create({
      title: "Buenos Aires",
      destination: "Argentina",
      startDate: "2026-10-12",
      endDate: "2026-10-16",
      timezone: "America/Argentina/Buenos_Aires"
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips");
    expect(request.request.method).toBe("POST");
    expect(request.request.body.endDate).toBe("2026-10-16");
    request.flush({});
  });

  it("creates a route between adjacent itinerary items", () => {
    service.createRoute("trip-1", {
      fromItemId: "item-1",
      toItemId: "item-2",
      transportMode: "walk",
      durationMinutes: 15,
      notes: "Seguir pela praça"
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/routes");
    expect(request.request.method).toBe("POST");
    expect(request.request.body.fromItemId).toBe("item-1");
    expect(request.request.body.toItemId).toBe("item-2");
    request.flush({});
  });

  it("updates a route with optimistic concurrency", () => {
    service.updateRoute("trip-1", "route-1", {
      transportMode: "transit",
      durationMinutes: 25,
      notes: null,
      version: 4
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/routes/route-1");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body.version).toBe(4);
    request.flush({});
  });

  it("updates a place with manual coordinates", () => {
    service.updatePlaceCoordinates("trip-1", "place-1", {
      latitude: -22.8969586,
      longitude: -47.0780046,
      version: 5
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/places/place-1/coordinates");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body).toEqual({
      latitude: -22.8969586,
      longitude: -47.0780046,
      version: 5
    });
    request.flush({});
  });

  it("requests a short-lived realtime ticket", () => {
    service.realtimeTicket("trip-1").subscribe();
    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/realtime-ticket");
    expect(request.request.method).toBe("POST");
    request.flush({ token: "ticket", expiresInSeconds: 60 });
  });

  it("updates a flight with optimistic concurrency", () => {
    service.updateFlight("trip-1", "flight-1", {
      direction: "return",
      departureAirport: "EZE",
      arrivalAirport: "GRU",
      departureAt: "2026-10-16T18:00",
      arrivalAt: "2026-10-16T20:40",
      airline: "LATAM",
      flightNumber: "LA8001",
      version: 2
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/flights/flight-1");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body.version).toBe(2);
    request.flush({});
  });

  it("updates a lodging with optimistic concurrency", () => {
    service.updateLodging("trip-1", "lodging-1", {
      name: "Hotel Centro",
      address: "Rua Principal, 10",
      checkInDate: "2026-10-12",
      checkOutDate: "2026-10-14",
      notes: "Recepção 24 horas",
      version: 3
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/lodgings/lodging-1");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body.version).toBe(3);
    request.flush({});
  });

  it("accepts a room invite explicitly", () => {
    service.acceptRoom("trip-1").subscribe();
    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1?accept=1");
    expect(request.request.method).toBe("GET");
    request.flush({});
  });
});
