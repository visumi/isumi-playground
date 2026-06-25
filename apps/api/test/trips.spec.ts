import type { Client } from "@libsql/client/web";
import { describe, expect, it, vi } from "vitest";
import { applyTripMoveOperation, createTripRoute, enumerateTripDates, lodgingPeriodsOverlap } from "../src/trips";

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

  it("treats check-out as an exclusive lodging boundary", () => {
    expect(lodgingPeriodsOverlap("2026-10-12", "2026-10-14", "2026-10-14", "2026-10-16")).toBe(false);
  });

  it("detects lodging periods that share at least one night", () => {
    expect(lodgingPeriodsOverlap("2026-10-12", "2026-10-15", "2026-10-14", "2026-10-16")).toBe(true);
    expect(lodgingPeriodsOverlap("2026-10-13", "2026-10-14", "2026-10-12", "2026-10-16")).toBe(true);
  });

  it("rejects routes whose items are not adjacent in the same day", async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [] })
    } as unknown as Client;

    await expect(createTripRoute(db, "user-1", "room-1", {
      fromItemId: "item-1",
      toItemId: "item-2",
      transportMode: "walk",
      durationMinutes: 10
    })).rejects.toThrowError("route_items_not_adjacent");
  });

  it("requires a valid route duration", async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
    } as unknown as Client;

    await expect(createTripRoute(db, "user-1", "room-1", {
      fromItemId: "item-1",
      toItemId: "item-2",
      transportMode: "walk",
      durationMinutes: 0
    })).rejects.toThrowError("invalid_route_duration");
  });

  it("removes only route pairs that stop being adjacent after a move", async () => {
    let statements: Array<{ sql: string }> = [];
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ day_id: "day-1", version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: "day-1" }] })
        .mockResolvedValueOnce({
          rows: [
            { id: "item-a", day_id: "day-1" },
            { id: "item-b", day_id: "day-1" },
            { id: "item-c", day_id: "day-1" }
          ]
        }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string }>) => {
        statements = nextStatements;
        throw new Error("stop_after_move_batch");
      })
    } as unknown as Client;

    await expect(applyTripMoveOperation(db, "user-1", "room-1", {
      operationId: "operation-1",
      type: "move_item",
      entityVersion: 1,
      itemId: "item-c",
      targetDayId: "day-1",
      targetPosition: 0
    })).rejects.toThrowError("stop_after_move_batch");

    const cleanup = statements.find((statement) => statement.sql.includes("DELETE FROM trip_routes"));
    expect(cleanup?.sql).toContain("destination.position = origin.position + 1");
    expect(cleanup?.sql).toContain("origin.id = trip_routes.from_item_id");
    expect(cleanup?.sql).toContain("destination.id = trip_routes.to_item_id");
  });
});
