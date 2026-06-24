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

  it("uploads WebP as a binary body", () => {
    const image = new Blob(["image"], { type: "image/webp" });
    service.uploadPlaceImage("trip-1", "place-1", image).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1/places/place-1/image");
    expect(request.request.method).toBe("PUT");
    expect(request.request.headers.get("Content-Type")).toBe("image/webp");
    expect(request.request.body).toBe(image);
    request.flush(null);
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

  it("accepts a room invite explicitly", () => {
    service.acceptRoom("trip-1").subscribe();
    const request = http.expectOne("http://localhost:8787/tools/trips/trip-1?accept=1");
    expect(request.request.method).toBe("GET");
    request.flush({});
  });
});
