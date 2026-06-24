import { describe, expect, it } from "vitest";
import { enumerateTripDates, isWebp } from "../src";

describe("trip planner validation", () => {
  it("enumerates every trip day inclusively", () => {
    expect(enumerateTripDates("2026-10-12", "2026-10-16")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16"
    ]);
  });

  it("rejects trips longer than one year", () => {
    expect(() => enumerateTripDates("2026-01-01", "2027-02-01")).toThrowError("trip_too_long");
  });

  it("recognizes the RIFF/WEBP signature", () => {
    expect(isWebp(new Uint8Array([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50
    ]))).toBe(true);
    expect(isWebp(new TextEncoder().encode("not-a-webp-file"))).toBe(false);
  });
});
