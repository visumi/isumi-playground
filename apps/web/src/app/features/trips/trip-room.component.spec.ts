import {
  TestBed
} from "@angular/core/testing";
import { signal } from "@angular/core";
import {
  LucideLandmark,
  LucideMapPin,
  LucideMoonStar,
  LucideShoppingBag,
  LucideTrees,
  LucideUtensils
} from "@lucide/angular";
import {
  PLACE_CATEGORY_VISUALS,
  arrivalLodgingForDate,
  buildTripGeneralMapPoints,
  departureLodgingForDate,
  googleMapsUrlForAddress,
  haversineDistanceInMeters,
  linkifyObservationText,
  parseCoordinatePair,
  suggestedLodgingDates,
  tripDayMapMarkerClass
} from "./trip-room.component";
import { TripGeneralMapModalComponent, TripGeneralMapModalData } from "./trip-general-map-modal.component";
import { ISUMI_MODAL_DATA, ISUMI_MODAL_REF, IsumiModalRef } from "../../shared/ui";
import { TripDay, TripDayItem, TripLodging, TripPlace, TripRoom } from "../../core/api/api.types";

describe("PLACE_CATEGORY_VISUALS", () => {
  it("assigns a unique icon and color treatment to every category", () => {
    expect(PLACE_CATEGORY_VISUALS.food.icon).toBe(LucideUtensils);
    expect(PLACE_CATEGORY_VISUALS.culture.icon).toBe(LucideLandmark);
    expect(PLACE_CATEGORY_VISUALS.nightlife.icon).toBe(LucideMoonStar);
    expect(PLACE_CATEGORY_VISUALS.nature.icon).toBe(LucideTrees);
    expect(PLACE_CATEGORY_VISUALS.shopping.icon).toBe(LucideShoppingBag);
    expect(PLACE_CATEGORY_VISUALS.other.icon).toBe(LucideMapPin);

    expect(new Set(Object.values(PLACE_CATEGORY_VISUALS).map((visual) => visual.icon)).size).toBe(6);
    expect(new Set(Object.values(PLACE_CATEGORY_VISUALS).map((visual) => visual.classes)).size).toBe(6);
  });
});

describe("linkifyObservationText", () => {
  it("splits observation text into safe text and link segments", () => {
    expect(linkifyObservationText("Reserva em https://example.com/checkin. Chegar cedo")).toEqual([
      { text: "Reserva em " },
      { text: "https://example.com/checkin", href: "https://example.com/checkin" },
      { text: "." },
      { text: " Chegar cedo" }
    ]);
  });

  it("opens www links as https URLs", () => {
    expect(linkifyObservationText("Menu: www.example.com/menu")[1]).toEqual({
      text: "www.example.com/menu",
      href: "https://www.example.com/menu"
    });
  });
});

describe("googleMapsUrlForAddress", () => {
  it("builds an encoded Google Maps search URL", () => {
    expect(googleMapsUrlForAddress("  Rua São José, 123 - Centro  "))
      .toBe("https://www.google.com/maps/search/?api=1&query=Rua%20S%C3%A3o%20Jos%C3%A9%2C%20123%20-%20Centro");
  });
});

describe("parseCoordinatePair", () => {
  it("accepts latitude and longitude separated by a comma", () => {
    expect(parseCoordinatePair("-22.90, -47.08")).toEqual({
      latitude: -22.90,
      longitude: -47.08
    });
  });

  it("rejects incomplete and out-of-range coordinates", () => {
    expect(parseCoordinatePair("-22.90")).toBeNull();
    expect(parseCoordinatePair("-91, -47.08")).toBeNull();
    expect(parseCoordinatePair("-22.90, -181")).toBeNull();
  });
});

describe("haversineDistanceInMeters", () => {
  it("keeps closer points closer when starting from the lodging", () => {
    const lodging = { latitude: -23.55052, longitude: -46.633308 };
    const nearby = { latitude: -23.551, longitude: -46.634 };
    const far = { latitude: -22.9068, longitude: -47.0608 };

    expect(haversineDistanceInMeters(lodging, nearby))
      .toBeLessThan(haversineDistanceInMeters(lodging, far));
  });
});

describe("trip general map helpers", () => {
  const days: TripDay[] = [
    { id: "day-1", date: "2026-10-10", position: 0 },
    { id: "day-2", date: "2026-10-11", position: 1 }
  ];
  const places: TripPlace[] = [
    createPlace("place-1", "Museu", -23.55, -46.63),
    createPlace("place-2", "Cafe", -23.56, -46.64),
    createPlace("place-3", "Sem coordenada", null, null)
  ];
  const items: TripDayItem[] = [
    { id: "item-1", dayId: "day-2", placeId: "place-1", position: 0, version: 1 }
  ];
  const lodgings: TripLodging[] = [
    {
      id: "lodging-1",
      name: "Hotel",
      address: "Rua A",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      notes: null,
      latitude: -23.57,
      longitude: -46.65,
      version: 1
    }
  ];

  it("builds scheduled, unscheduled and lodging points for the general map", () => {
    const points = buildTripGeneralMapPoints(days, places, items, lodgings);

    expect(points.map((point) => `${point.id}:${point.status}`))
      .toEqual(["lodging-lodging-1:lodging", "item-1:scheduled", "place-place-2:unscheduled"]);
    expect(points[1]).toEqual(jasmine.objectContaining({
      dayNumber: 2,
      markerClass: tripDayMapMarkerClass(2),
      markerLabel: "2",
      subtitle: "Dia 2 · Parada 1"
    }));
    expect(points[2]).toEqual(jasmine.objectContaining({
      placeId: "place-2",
      markerClass: "trip-map-marker--unscheduled",
      subtitle: "Pendente"
    }));
  });

  it("lets the general map modal allocate selected pending places and clears the selection", async () => {
    const allocate = jasmine.createSpy("allocate").and.resolveTo();
    const data: TripGeneralMapModalData = {
      points: signal(buildTripGeneralMapPoints(days, places, items, lodgings)),
      days,
      allocate
    };
    TestBed.configureTestingModule({
      imports: [TripGeneralMapModalComponent],
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: data },
        { provide: ISUMI_MODAL_REF, useValue: new IsumiModalRef<TripGeneralMapModalData, void>(data) }
      ]
    });
    const fixture = TestBed.createComponent(TripGeneralMapModalComponent);
    const component = fixture.componentInstance;

    component.togglePlace("place-2", true);
    await component.submitAllocation(new Event("submit"));

    expect(allocate).toHaveBeenCalledOnceWith({ dayId: "day-1", placeIds: ["place-2"], itemIds: [] });
    expect(component.selectedPlaceIds()).toEqual([]);
  });

  it("toggles pending place selection when the same map point is clicked again", () => {
    const data: TripGeneralMapModalData = {
      points: signal(buildTripGeneralMapPoints(days, places, items, lodgings)),
      days,
      allocate: jasmine.createSpy("allocate").and.resolveTo()
    };
    TestBed.configureTestingModule({
      imports: [TripGeneralMapModalComponent],
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: data },
        { provide: ISUMI_MODAL_REF, useValue: new IsumiModalRef<TripGeneralMapModalData, void>(data) }
      ]
    });
    const fixture = TestBed.createComponent(TripGeneralMapModalComponent);
    const component = fixture.componentInstance;
    const pendingPoint = data.points().find((point) => point.status === "unscheduled")!;

    component.togglePoint(pendingPoint);
    component.togglePoint(pendingPoint);

    expect(component.selectedPlaceIds()).toEqual([]);
  });

  it("lets the general map modal move scheduled places to another day", async () => {
    const allocate = jasmine.createSpy("allocate").and.resolveTo();
    const data: TripGeneralMapModalData = {
      points: signal(buildTripGeneralMapPoints(days, places, items, lodgings)),
      days,
      allocate
    };
    TestBed.configureTestingModule({
      imports: [TripGeneralMapModalComponent],
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: data },
        { provide: ISUMI_MODAL_REF, useValue: new IsumiModalRef<TripGeneralMapModalData, void>(data) }
      ]
    });
    const fixture = TestBed.createComponent(TripGeneralMapModalComponent);
    const component = fixture.componentInstance;
    const scheduledPoint = data.points().find((point) => point.status === "scheduled")!;

    component.togglePoint(scheduledPoint);
    await component.submitAllocation(new Event("submit"));

    expect(allocate).toHaveBeenCalledOnceWith({ dayId: "day-1", placeIds: [], itemIds: ["item-1"] });
    expect(component.selectedPlaceIds()).toEqual([]);
  });

  it("does not offer a move action when the selected place is already on the chosen day", async () => {
    const allocate = jasmine.createSpy("allocate").and.resolveTo();
    const data: TripGeneralMapModalData = {
      points: signal(buildTripGeneralMapPoints(days, places, items, lodgings)),
      days,
      allocate
    };
    TestBed.configureTestingModule({
      imports: [TripGeneralMapModalComponent],
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: data },
        { provide: ISUMI_MODAL_REF, useValue: new IsumiModalRef<TripGeneralMapModalData, void>(data) }
      ]
    });
    const fixture = TestBed.createComponent(TripGeneralMapModalComponent);
    const component = fixture.componentInstance;
    const scheduledPoint = data.points().find((point) => point.status === "scheduled")!;

    component.selectedDayId.set("day-2");
    component.togglePoint(scheduledPoint);
    await component.submitAllocation(new Event("submit"));

    expect(component.canApplyToDay()).toBeFalse();
    expect(component.primaryActionLabel()).toBe("Escolha lugares no mapa");
    expect(allocate).not.toHaveBeenCalled();
  });

  it("lets the general map modal remove scheduled places from the trip days", async () => {
    const allocate = jasmine.createSpy("allocate").and.resolveTo();
    const data: TripGeneralMapModalData = {
      points: signal(buildTripGeneralMapPoints(days, places, items, lodgings)),
      days,
      allocate
    };
    TestBed.configureTestingModule({
      imports: [TripGeneralMapModalComponent],
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: data },
        { provide: ISUMI_MODAL_REF, useValue: new IsumiModalRef<TripGeneralMapModalData, void>(data) }
      ]
    });
    const fixture = TestBed.createComponent(TripGeneralMapModalComponent);
    const component = fixture.componentInstance;
    const scheduledPoint = data.points().find((point) => point.status === "scheduled")!;

    component.togglePoint(scheduledPoint);
    await component.removeSelectedFromDays();

    expect(allocate).toHaveBeenCalledOnceWith({ placeIds: [], itemIds: [], removeItemIds: ["item-1"] });
    expect(component.selectedPlaceIds()).toEqual([]);
  });

  it("blocks map allocation actions while an API request is processing", () => {
    const allocate = jasmine.createSpy("allocate").and.returnValue(new Promise<void>(() => undefined));
    const data: TripGeneralMapModalData = {
      points: signal(buildTripGeneralMapPoints(days, places, items, lodgings)),
      days,
      allocate
    };
    TestBed.configureTestingModule({
      imports: [TripGeneralMapModalComponent],
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: data },
        { provide: ISUMI_MODAL_REF, useValue: new IsumiModalRef<TripGeneralMapModalData, void>(data) }
      ]
    });
    const fixture = TestBed.createComponent(TripGeneralMapModalComponent);
    const component = fixture.componentInstance;
    const pendingPoint = data.points().find((point) => point.status === "unscheduled")!;
    const scheduledPoint = data.points().find((point) => point.status === "scheduled")!;

    component.togglePoint(pendingPoint);
    void component.submitAllocation(new Event("submit"));

    expect(component.busy()).toBeTrue();
    expect(component.canApplyToDay()).toBeFalse();
    expect(component.canRemoveFromDay()).toBeFalse();

    component.togglePoint(scheduledPoint);
    component.togglePlace("place-2", false);
    void component.removeSelectedFromDays();

    expect(component.selectedPlaceIds()).toEqual(["place-2"]);
    expect(allocate).toHaveBeenCalledOnceWith({ dayId: "day-1", placeIds: ["place-2"], itemIds: [] });
  });

  function createPlace(id: string, name: string, latitude: number | null, longitude: number | null): TripPlace {
    return {
      id,
      name,
      category: "culture",
      address: `${name} address`,
      notes: null,
      latitude,
      longitude,
      geocodedAddress: null,
      geocodedAt: null,
      geocodingStatus: null,
      createdByUserId: "user-1",
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };
  }
});

describe("lodging day helpers", () => {
  const room: TripRoom = {
    id: "trip-1",
    ownerUserId: "user-1",
    title: "Viagem",
    destination: "São Paulo",
    startDate: "2026-10-10",
    endDate: "2026-10-20",
    timezone: "America/Sao_Paulo",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };
  const lodgings: TripLodging[] = [
    {
      id: "old-hotel",
      name: "Hotel antigo",
      address: "Rua A",
      checkInDate: "2026-10-12",
      checkOutDate: "2026-10-14",
      notes: null,
      latitude: -23.55,
      longitude: -46.63,
      version: 1
    },
    {
      id: "new-hotel",
      name: "Hotel novo",
      address: "Rua B",
      checkInDate: "2026-10-14",
      checkOutDate: "2026-10-16",
      notes: null,
      latitude: -23.56,
      longitude: -46.64,
      version: 1
    }
  ];

  it("uses the checkout lodging as the departure lodging on transfer day", () => {
    expect(departureLodgingForDate(lodgings, "2026-10-14")?.id).toBe("old-hotel");
  });

  it("uses the check-in lodging as the arrival lodging on transfer day", () => {
    const departure = departureLodgingForDate(lodgings, "2026-10-14");

    expect(arrivalLodgingForDate(lodgings, "2026-10-14", departure)?.id).toBe("new-hotel");
  });

  it("does not duplicate the same lodging as arrival on normal days", () => {
    const departure = departureLodgingForDate(lodgings, "2026-10-13");

    expect(departure?.id).toBe("old-hotel");
    expect(arrivalLodgingForDate(lodgings, "2026-10-13", departure)).toBeNull();
  });

  it("suggests the trip range when there are no lodgings yet", () => {
    expect(suggestedLodgingDates(room, [])).toEqual({
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-20"
    });
  });

  it("suggests the last registered checkout as check-in and the trip end as checkout", () => {
    expect(suggestedLodgingDates(room, [lodgings[1], lodgings[0]])).toEqual({
      checkInDate: "2026-10-16",
      checkOutDate: "2026-10-20"
    });
  });
});
