import type { Client } from "@libsql/client/web";
import { describe, expect, it, vi } from "vitest";
import {
  applyTripMoveOperation,
  createTripFlight,
  createTripLodging,
  createTripPlace,
  createTripRoute,
  deleteTripPlace,
  enumerateTripDates,
  lodgingPeriodsOverlap,
  reorderTripDayItems,
  updateTripFlight
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

  it("creates a flight with an optional connection and manual layover", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [{ role: "member" }] }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_flight_batch");
      })
    } as unknown as Client;

    await expect(createTripFlight(db, "user-1", "room-1", {
      direction: "outbound",
      departureAirport: "GRU",
      arrivalAirport: "EZE",
      departureAt: "2026-10-12T08:00",
      arrivalAt: "2026-10-12T11:00",
      airline: "LATAM",
      flightNumber: "LA8000",
      connection: {
        departureAirport: "EZE",
        arrivalAirport: "AEP",
        departureAt: "2026-10-12T13:30",
        arrivalAt: "2026-10-12T14:10",
        airline: "Aerolineas",
        flightNumber: "AR100",
        layoverMinutes: 150
      }
    })).rejects.toThrowError("stop_after_flight_batch");

    expect(statements[0]?.sql).toContain("INSERT INTO trip_flight_segments");
    expect(statements[1]?.sql).toContain("INSERT INTO trip_flight_connections");
    expect(statements[1]?.args).toEqual(expect.arrayContaining(["EZE", "AEP", 150]));
  });

  it("rejects invalid flight direction and connection layover", async () => {
    const directionDb = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [{ role: "member" }] })
    } as unknown as Client;

    await expect(createTripFlight(directionDb, "user-1", "room-1", {
      direction: "other" as never,
      departureAirport: "GRU",
      arrivalAirport: "EZE",
      departureAt: "2026-10-12T08:00",
      arrivalAt: "2026-10-12T11:00"
    })).rejects.toThrowError("invalid_flight_direction");

    const layoverDb = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [{ role: "member" }] })
    } as unknown as Client;

    await expect(createTripFlight(layoverDb, "user-1", "room-1", {
      direction: "outbound",
      departureAirport: "GRU",
      arrivalAirport: "EZE",
      departureAt: "2026-10-12T08:00",
      arrivalAt: "2026-10-12T11:00",
      connection: {
        departureAirport: "EZE",
        arrivalAirport: "AEP",
        departureAt: "2026-10-12T13:30",
        arrivalAt: "2026-10-12T14:10",
        layoverMinutes: 3000
      }
    })).rejects.toThrowError("invalid_connection_layover");
  });

  it("updates a flight connection by replacing the previous nested segment", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rowsAffected: 1 }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_update_connection_batch");
      })
    } as unknown as Client;

    await expect(updateTripFlight(db, "user-1", "room-1", "flight-1", {
      direction: "return",
      departureAirport: "AEP",
      arrivalAirport: "EZE",
      departureAt: "2026-10-16T15:00",
      arrivalAt: "2026-10-16T16:00",
      version: 2,
      connection: {
        departureAirport: "EZE",
        arrivalAirport: "GRU",
        departureAt: "2026-10-16T18:30",
        arrivalAt: "2026-10-16T21:10",
        layoverMinutes: 150
      }
    })).rejects.toThrowError("stop_after_update_connection_batch");

    expect(statements[0]?.sql).toContain("DELETE FROM trip_flight_connections");
    expect(statements[1]?.sql).toContain("INSERT INTO trip_flight_connections");
    expect(statements[1]?.args).toEqual(expect.arrayContaining(["EZE", "GRU", 150]));
  });

  it("removes a flight connection when the nested segment is null", async () => {
    let statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ role: "member" }] })
        .mockResolvedValueOnce({ rowsAffected: 1 }),
      batch: vi.fn().mockImplementation(async (nextStatements: Array<{ sql: string; args: unknown[] }>) => {
        statements = nextStatements;
        throw new Error("stop_after_remove_connection_batch");
      })
    } as unknown as Client;

    await expect(updateTripFlight(db, "user-1", "room-1", "flight-1", {
      direction: "outbound",
      departureAirport: "GRU",
      arrivalAirport: "EZE",
      departureAt: "2026-10-12T08:00",
      arrivalAt: "2026-10-12T11:00",
      version: 3,
      connection: null
    })).rejects.toThrowError("stop_after_remove_connection_batch");

    expect(statements[0]?.sql).toContain("DELETE FROM trip_flight_connections");
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO trip_flight_connections"))).toBe(false);
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
});
