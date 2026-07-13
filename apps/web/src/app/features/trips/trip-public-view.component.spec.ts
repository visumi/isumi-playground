import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { PublicTripSnapshot } from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import { IsumiModalService } from "../../shared/ui";
import { TripDayMapModalComponent } from "./trip-day-map-modal.component";
import { TripPublicViewComponent } from "./trip-public-view.component";

describe("TripPublicViewComponent", () => {
  let fixture: ComponentFixture<TripPublicViewComponent>;
  let trips: jasmine.SpyObj<TripsService>;
  let modal: IsumiModalService;

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
    modal = TestBed.inject(IsumiModalService);
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
    expect(text).not.toContain("Editar");
    expect(text).not.toContain("Excluir");
  });

  it("defaults to the overview and preserves the selected day when changing views", () => {
    trips.publicSnapshot.and.returnValue(of(snapshot));

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "share-token");
    fixture.detectChanges();

    const overviewButton = fixture.nativeElement.querySelector("button[aria-label='Exibir todos os dias da viagem']") as HTMLButtonElement;
    const dayButton = fixture.nativeElement.querySelector("button[aria-label='Exibir um dia por vez']") as HTMLButtonElement;
    expect(overviewButton.getAttribute("aria-pressed")).toBe("true");
    expect(fixture.nativeElement.querySelectorAll("section[id^='public-trip-day-']").length).toBe(2);

    dayButton.click();
    fixture.detectChanges();
    expect(dayButton.getAttribute("aria-pressed")).toBe("true");
    expect(fixture.nativeElement.querySelectorAll("section[id^='public-trip-day-']").length).toBe(1);

    fixture.componentInstance.focusedDayId.set("day-2");
    fixture.detectChanges();
    spyOn(window, "requestAnimationFrame").and.callFake((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    spyOn(fixture.componentInstance, "scrollToDay");

    overviewButton.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.focusedDayId()).toBe("day-2");
    expect(fixture.componentInstance.scrollToDay).toHaveBeenCalledWith("day-2");
    expect(fixture.nativeElement.querySelectorAll("section[id^='public-trip-day-']").length).toBe(2);
  });

  it("opens the read-only daily map from the mini map", () => {
    trips.publicSnapshot.and.returnValue(of({
      ...snapshot,
      lodgings: [{
        id: "lodging-1",
        name: "Hotel Centro",
        address: "Rua Um, 10",
        checkInDate: "2026-10-11",
        checkOutDate: "2026-10-12",
        notes: null,
        latitude: -34.6037,
        longitude: -58.3816
      }]
    }));
    const openModal = spyOn(modal, "open");

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "share-token");
    fixture.detectChanges();
    fixture.detectChanges();

    const miniMapButton = fixture.nativeElement.querySelector("button[aria-label='Visualizar mapa do dia 1']") as HTMLButtonElement;
    expect(miniMapButton).toBeTruthy();
    miniMapButton.click();

    expect(openModal).toHaveBeenCalledWith(
      TripDayMapModalComponent,
      jasmine.objectContaining({
        ariaLabel: "Mapa do dia 1",
        data: jasmine.objectContaining({
          dayNumber: 1,
          date: "2026-10-12",
          points: jasmine.arrayContaining([jasmine.objectContaining({ id: "item-1" })])
        })
      })
    );
  });

  it("does not render a mini map control when the day has no coordinates", () => {
    trips.publicSnapshot.and.returnValue(of({
      ...snapshot,
      places: [{ ...snapshot.places[0], latitude: null, longitude: null }]
    }));

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "share-token");
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector("button[aria-label^='Visualizar mapa do dia']")).toBeNull();
  });

  it("shows a missing route between same-day lodging changes", () => {
    trips.publicSnapshot.and.returnValue(of({
      ...snapshot,
      items: [],
      lodgings: [
        {
          id: "lodging-1",
          name: "Hotel Centro",
          address: "Rua Um, 10",
          checkInDate: "2026-10-11",
          checkOutDate: "2026-10-12",
          notes: null,
          latitude: null,
          longitude: null
        },
        {
          id: "lodging-2",
          name: "Pousada Norte",
          address: "Rua Dois, 20",
          checkInDate: "2026-10-12",
          checkOutDate: "2026-10-13",
          notes: null,
          latitude: null,
          longitude: null
        }
      ]
    }));

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "share-token");
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Hotel Centro");
    expect(text).toContain("Pousada Norte");
    expect(text).toContain("Trajeto não informado");
  });

  it("shows an unavailable state when the public link fails", () => {
    trips.publicSnapshot.and.returnValue(throwError(() => new Error("not_found")));

    fixture = TestBed.createComponent(TripPublicViewComponent);
    fixture.componentRef.setInput("shareToken", "missing-token");
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Link de viagem indisponível");
  });
});
