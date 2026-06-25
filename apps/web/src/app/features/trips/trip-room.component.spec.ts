import {
  LucideLandmark,
  LucideMapPin,
  LucideMoonStar,
  LucideShoppingBag,
  LucideTrees,
  LucideUtensils
} from "@lucide/angular";
import { PLACE_CATEGORY_VISUALS } from "./trip-room.component";

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
