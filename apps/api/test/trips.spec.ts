import type { Client } from "@libsql/client/web";
import { describe, expect, it, vi } from "vitest";
import {
  applyTripMoveOperation,
  bulkUpdateTripDayItems,
  createTripLodging,
  createTripPlace,
  createTripRoute,
  deleteTripPlace,
  ensureTripPublicShareToken,
  enumerateTripDates,
  getPublicTripSnapshot,
  lodgingPeriodsOverlap,
  reorderTripDayItems,
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

  it("allows lodging routes on the check-out day", async () => {
    let statements: Array<{ sql: string }> = [];
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "member" }] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    const db = {
      execute,
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string }>) => {
        statements = nextStatements;
        throw new Error("stop_after_route_batch");
      })
    } as unknown as Client;

    await expect(createTripRoute(db, "user-1", "room-1", {
      fromLodgingId: "lodging-1",
      toItemId: "item-1",
      transportMode: "walk",
      durationMinutes: 12
    })).rejects.toThrowError("stop_after_route_batch");

    const lodgingRouteCheck = String(execute.mock.calls[1][0].sql);
    expect(lodgingRouteCheck).toContain("day.date <= lodging.check_out_date");
    expect(statements[0]?.sql).toContain("INSERT INTO trip_routes");
  });

  it("creates a route from the last stop to the check-in lodging", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "member" }] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    const db = {
      execute,
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_arrival_route_batch");
      })
    } as unknown as Client;

    await expect(createTripRoute(db, "user-1", "room-1", {
      fromItemId: "item-last",
      toLodgingId: "lodging-new",
      transportMode: "car",
      durationMinutes: 18
    })).rejects.toThrowError("stop_after_arrival_route_batch");

    const arrivalRouteCheck = String(execute.mock.calls[1][0].sql);
    expect(arrivalRouteCheck).toContain("lodging.check_in_date = day.date");
    expect(arrivalRouteCheck).toContain("later.position > origin.position");
    expect(statements[0]?.sql).toContain("to_lodging_id");
    expect(statements[0]?.args).toEqual(expect.arrayContaining(["item-last", "lodging-new"]));
  });

  it("creates a direct lodging transfer route when the transfer day has no stops", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "member" }] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    const db = {
      execute,
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_lodging_transfer_batch");
      })
    } as unknown as Client;

    await expect(createTripRoute(db, "user-1", "room-1", {
      fromLodgingId: "lodging-old",
      toLodgingId: "lodging-new",
      transportMode: "transit",
      durationMinutes: 35
    })).rejects.toThrowError("stop_after_lodging_transfer_batch");

    const transferRouteCheck = String(execute.mock.calls[1][0].sql);
    expect(transferRouteCheck).toContain("arrival.check_in_date = departure.check_out_date");
    expect(transferRouteCheck).toContain("NOT EXISTS");
    expect(statements[0]?.sql).toContain("to_lodging_id");
    expect(statements[0]?.args).toEqual(expect.arrayContaining(["lodging-old", "lodging-new"]));
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
    expect(cleanup?.sql).toContain("trip_routes.to_lodging_id");
  });

  it("stores manual coordinates when creating a place", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [{ role: "member" }] }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_place_batch");
      })
    } as unknown as Client;

    await expect(createTripPlace(db, "user-1", "room-1", {
      name: "Praça da Sé",
      category: "culture",
      address: "Praça da Sé, São Paulo",
      latitude: -23.55052,
      longitude: -46.633308
    })).rejects.toThrowError("stop_after_place_batch");

    expect(statements[0]?.sql).toContain("INSERT INTO trip_places");
    expect(statements[0]?.sql).toContain("geocoding_status");
    expect(statements[0]?.args).toEqual(expect.arrayContaining([-23.55052, -46.633308]));
  });

  it("stores manual coordinates when creating a lodging", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [] }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_lodging_batch");
      })
    } as unknown as Client;

    await expect(createTripLodging(db, "user-1", "room-1", {
      name: "Hotel Centro",
      address: "Rua Principal, 10",
      checkInDate: "2026-10-12",
      checkOutDate: "2026-10-14",
      latitude: -22.8969586,
      longitude: -47.0780046
    })).rejects.toThrowError("stop_after_lodging_batch");

    expect(statements[0]?.sql).toContain("INSERT INTO trip_lodgings");
    expect(statements[0]?.args).toEqual(expect.arrayContaining([-22.8969586, -47.0780046]));
  });

  it("allows a lodging to start on another lodging check-out date", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ role: "member" }] })
      .mockResolvedValueOnce({ rows: [] });
    const db = {
      execute,
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_adjacent_lodging_batch");
      })
    } as unknown as Client;

    await expect(createTripLodging(db, "user-1", "room-1", {
      name: "Hotel novo",
      address: "Rua Nova, 20",
      checkInDate: "2026-10-14",
      checkOutDate: "2026-10-16",
      latitude: -22.9,
      longitude: -47.08
    })).rejects.toThrowError("stop_after_adjacent_lodging_batch");

    const conflictCheck = String(execute.mock.calls[1][0].sql);
    expect(conflictCheck).toContain("check_in_date < ?");
    expect(conflictCheck).toContain("check_out_date > ?");
    expect(statements[0]?.args).toEqual(expect.arrayContaining(["2026-10-14", "2026-10-16"]));
  });

  it("rejects place coordinates outside valid ranges", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ role: "member" }] })
    } as unknown as Client;

    await expect(createTripPlace(db, "user-1", "room-1", {
      name: "Tokyo Skytree",
      latitude: -91,
      longitude: 139.8107141
    })).rejects.toThrowError("invalid_latitude");
  });

  it("reorders every item in a day atomically", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [{ id: "day-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-a" }, { id: "item-b" }, { id: "item-c" }] }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_reorder_batch");
      })
    } as unknown as Client;

    await expect(reorderTripDayItems(db, "user-1", "room-1", "day-1", {
      itemIds: ["item-b", "item-c", "item-a"]
    })).rejects.toThrowError("stop_after_reorder_batch");

    expect(statements.slice(0, 3).map((statement) => statement.args[0])).toEqual([0, 1, 2]);
    expect(statements.slice(0, 3).map((statement) => statement.args[1])).toEqual(["item-b", "item-c", "item-a"]);
    expect(statements.find((statement) => statement.sql.includes("DELETE FROM trip_routes"))?.sql)
      .toContain("destination.position = origin.position + 1");
  });

  it("updates trip day items in bulk with one transaction", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [{ id: "day-2" }] })
        .mockResolvedValueOnce({ rows: [{ id: "place-3" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [
          { id: "item-1", day_id: "day-1" },
          { id: "item-2", day_id: "day-1" }
        ] })
        .mockResolvedValueOnce({ rows: [{ next_position: 2 }] }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_bulk_items_batch");
      })
    } as unknown as Client;

    await expect(bulkUpdateTripDayItems(db, "user-1", "room-1", {
      dayId: "day-2",
      placeIds: ["place-3"],
      itemIds: ["item-1"],
      removeItemIds: ["item-2"]
    })).rejects.toThrowError("stop_after_bulk_items_batch");

    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(statements.some((statement) => statement.sql.includes("DELETE FROM trip_day_items"))).toBe(true);
    expect(statements.some((statement) => statement.sql.includes("UPDATE trip_day_items SET day_id = ?"))).toBe(true);
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO trip_day_items"))).toBe(true);
    expect(statements.filter((statement) => statement.sql.includes("SELECT COUNT(*) - 1")).map((statement) => statement.args[0]))
      .toEqual(expect.arrayContaining(["day-1", "day-2"]));
    expect(statements.at(-1)?.sql).toContain("UPDATE trip_rooms SET revision = revision + 1");
  });

  it("rejects item orders that do not match the whole day", async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [{ id: "day-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-a" }, { id: "item-b" }] })
    } as unknown as Client;

    await expect(reorderTripDayItems(db, "user-1", "room-1", "day-1", {
      itemIds: ["item-a"]
    })).rejects.toThrowError("invalid_item_order");
  });

  it("returns a public trip snapshot without member identity or editing metadata", async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: "room-1",
            owner_user_id: "owner-1",
            title: "Buenos Aires",
            destination: "Argentina",
            start_date: "2026-10-12",
            end_date: "2026-10-16",
            timezone: "America/Argentina/Buenos_Aires",
            revision: 4,
            created_at: "2026-01-01 00:00:00",
            updated_at: "2026-01-02 00:00:00"
          }]
        })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: "day-1", date: "2026-10-12", position: 0 }] })
        .mockResolvedValueOnce({
          rows: [{
            id: "place-1",
            name: "Café Tortoni",
            category: "food",
            address: "Av. de Mayo",
            notes: "Reserva feita",
            latitude: -34.6089,
            longitude: -58.3781
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: "item-1", day_id: "day-1", place_id: "place-1", position: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
    } as unknown as Client;

    const snapshot = await getPublicTripSnapshot(db, "share-token");

    expect(snapshot.membersCount).toBe(2);
    expect(snapshot.room).toEqual({
      id: "room-1",
      title: "Buenos Aires",
      destination: "Argentina",
      startDate: "2026-10-12",
      endDate: "2026-10-16",
      timezone: "America/Argentina/Buenos_Aires",
      revision: 4,
      updatedAt: "2026-01-02T00:00:00Z"
    });
    expect("currentMemberRole" in snapshot).toBe(false);
    expect("members" in snapshot).toBe(false);
    expect("ownerUserId" in snapshot.room).toBe(false);
    expect("createdByUserId" in snapshot.places[0]).toBe(false);
    expect("version" in snapshot.items[0]).toBe(false);
  });

  it("rejects an unknown public trip token", async () => {
    const db = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [] })
    } as unknown as Client;

    await expect(getPublicTripSnapshot(db, "missing-token")).rejects.toThrowError("not_found");
  });

  it("returns an existing public share token for trip members", async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rows: [{ public_share_token: "share-token" }] })
    } as unknown as Client;

    await expect(ensureTripPublicShareToken(db, "user-1", "room-1"))
      .resolves.toEqual({ publicShareToken: "share-token" });
  });
});
