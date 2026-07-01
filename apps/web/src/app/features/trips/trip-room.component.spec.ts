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
  departureLodgingForDate,
  googleMapsUrlForAddress,
  haversineDistanceInMeters,
  linkifyObservationText,
  parseCoordinatePair,
  suggestedLodgingDates
} from "./trip-room.component";
import { TripLodging, TripRoom } from "../../core/api/api.types";

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
