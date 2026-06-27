import type { Client } from "@libsql/client/web";
import { describe, expect, it, vi } from "vitest";
import {
  applyTripMoveOperation,
  createTripRoute,
  deleteTripPlace,
  enumerateTripDates,
  geocodeTripPlaceAddress,
  lodgingPeriodsOverlap,
  updateTripPlaceCoordinates
} from "../src/trips";

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

  it("does not delete a place that is already planned", async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] })
    } as unknown as Client;

    await expect(deleteTripPlace(db, "user-1", "room-1", "place-1"))
      .rejects.toThrowError("planned_place_cannot_be_deleted");
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

  it("stores coordinates returned by the trip geocoder", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const db = {
      execute
    } as unknown as Client;
    const geocoderFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "-23.55052", lon: "-46.633308", display_name: "Sao Paulo, Brasil" }]
    });

    await geocodeTripPlaceAddress(db, "room-1", "place-1", "Praca da Se, Sao Paulo", {
      userAgent: "isumi-playground-test/1.0",
      fetch: geocoderFetch as unknown as typeof fetch
    });

    expect(geocoderFetch).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      args: [-23.55052, -46.633308, "Sao Paulo, Brasil", "place-1", "room-1"]
    }));
  });

  it("marks geocoding as failed when no coordinates are found", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const db = {
      execute
    } as unknown as Client;
    const geocoderFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    });

    await geocodeTripPlaceAddress(db, "room-1", "place-1", "Endereco inexistente", {
      fetch: geocoderFetch as unknown as typeof fetch
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      args: ["place-1", "room-1"]
    }));
    expect(String(execute.mock.calls[0][0].sql)).toContain("geocoding_status = 'failed'");
  });

  it("stores manual coordinates for a place whose geocoding failed", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "member" }] })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ role: "member" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "room-1",
          owner_user_id: "user-1",
          title: "Tokyo",
          destination: "Tokyo",
          start_date: "2026-10-12",
          end_date: "2026-10-12",
          timezone: "Asia/Tokyo",
          revision: 1,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z"
        }]
      })
      .mockResolvedValue({ rows: [] });
    const db = {
      execute
    } as unknown as Client;

    await updateTripPlaceCoordinates(db, "user-1", "room-1", "place-1", {
      latitude: 35.7100543,
      longitude: 139.8107141,
      version: 2
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      args: [35.7100543, 139.8107141, "place-1", "room-1", 2]
    }));
    expect(String(execute.mock.calls[1][0].sql)).toContain("geocoding_status = 'resolved'");
  });

  it("rejects manual coordinates outside valid ranges", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ role: "member" }] })
    } as unknown as Client;

    await expect(updateTripPlaceCoordinates(db, "user-1", "room-1", "place-1", {
      latitude: -91,
      longitude: 139.8107141,
      version: 2
    })).rejects.toThrowError("invalid_latitude");
  });
});
