import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ExpensesService } from "./expenses.service";

describe("ExpensesService", () => {
  let service: ExpensesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(ExpensesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("lists rooms from the API", () => {
    service.listRooms().subscribe((rooms) => {
      expect(rooms).toEqual([]);
    });

    const request = http.expectOne("http://localhost:8787/tools/expenses/rooms");
    expect(request.request.method).toBe("GET");
    request.flush([]);
  });

  it("creates an item in a room", () => {
    service.createItem("room-1", {
      description: "Mercado",
      amountCents: 1200,
      payerParticipantId: "ana",
      splits: [{ participantId: "ana", shareUnits: 1 }]
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/expenses/rooms/room-1/items");
    expect(request.request.method).toBe("POST");
    expect(request.request.body.amountCents).toBe(1200);
    request.flush({
      subtotalCents: 0,
      totalCents: 0,
      participants: [],
      items: [],
      participantTotals: [],
      balances: [],
      settlements: []
    });
  });

  it("accepts a room invite explicitly", () => {
    service.acceptRoom("room-1").subscribe();

    const request = http.expectOne("http://localhost:8787/tools/expenses/rooms/room-1?accept=1");
    expect(request.request.method).toBe("GET");
    request.flush({});
  });

  it("updates a settlement paid state", () => {
    service.updateSettlement("room-1", {
      fromParticipantId: "ana",
      toParticipantId: "bruno",
      paid: true
    }).subscribe();

    const request = http.expectOne("http://localhost:8787/tools/expenses/rooms/room-1/settlements");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body.paid).toBeTrue();
    request.flush({});
  });

  it("deletes a participant from a room", () => {
    service.deleteParticipant("room-1", "participant-1").subscribe();

    const request = http.expectOne("http://localhost:8787/tools/expenses/rooms/room-1/participants/participant-1");
    expect(request.request.method).toBe("DELETE");
    request.flush(null);
  });
});
