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
  googleMapsUrlForAddress,
  haversineDistanceInMeters,
  linkifyObservationText,
  parseCoordinatePair
} from "./trip-room.component";

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
