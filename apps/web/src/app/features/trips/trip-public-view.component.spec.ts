import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { PublicTripSnapshot } from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import { TripPublicViewComponent } from "./trip-public-view.component";

describe("TripPublicViewComponent", () => {
  let fixture: ComponentFixture<TripPublicViewComponent>;
  let trips: jasmine.SpyObj<TripsService>;

  const snapshot: PublicTripSnapshot = {
    room: {
      id: "trip-1",
      title: "Férias em Buenos Aires",
      destination: "Buenos Aires, Argentina",
      startDate: "2026-10-12",
      endDate: "2026-10-13",
      timezone: "America/Argentina/Buenos_Aires",
      revision: 2,
      updatedAt: "2026-01-02T00:00:00Z"
    },
    membersCount: 3,
    days: [
      { id: "day-1", date: "2026-10-12", position: 0 },
      { id: "day-2", date: "2026-10-13", position: 1 }
    ],
    places: [{
      id: "place-1",
      name: "Café Tortoni",
      category: "food",
      address: "Av. de Mayo 825",
      notes: "Reserva confirmada",
      latitude: -34.6089,
      longitude: -58.3781
    }],
    items: [{ id: "item-1", dayId: "day-1", placeId: "place-1", position: 0 }],
    routes: [],
    lodgings: []
  };

  beforeEach(() => {
    trips = jasmine.createSpyObj<TripsService>("TripsService", ["publicSnapshot"]);
    TestBed.configureTestingModule({
      imports: [TripPublicViewComponent],
      providers: [{ provide: TripsService, useValue: trips }]
    });
  });

  it("renders a read-only public itinerary", () => {
    trips.publicSnapshot.and.returnValue(of(snapshot));

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "share-token");
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(trips.publicSnapshot).toHaveBeenCalledOnceWith("share-token");
    expect(text).toContain("Férias em Buenos Aires");
    expect(text).toContain("Café Tortoni");
    expect(text).toContain("Somente visualização");
    expect(text).not.toContain("Editar");
    expect(text).not.toContain("Excluir");
  });

  it("shows an unavailable state when the public link fails", () => {
    trips.publicSnapshot.and.returnValue(throwError(() => new Error("not_found")));

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "missing-token");
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Link de viagem indisponível");
  });
});
