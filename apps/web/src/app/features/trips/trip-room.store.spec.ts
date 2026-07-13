import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { TripSnapshot } from "../../core/api/api.types";
import { TripRoomStore, parseTripRealtimeEvent } from "./trip-room.store";

describe("TripRoomStore", () => {
  function createSnapshot(): TripSnapshot {
    return {
      room: {
        id: "trip-1",
        ownerUserId: "owner",
        title: "Viagem",
        destination: "Destino",
        startDate: "2026-10-12",
        endDate: "2026-10-13",
        timezone: "UTC",
        publicShareToken: "share-token",
        revision: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      },
      currentMemberRole: "owner",
      members: [],
      days: [
        { id: "day-1", date: "2026-10-12", position: 0 },
        { id: "day-2", date: "2026-10-13", position: 1 }
      ],
      places: [],
      items: [
        {
          id: "first",
          dayId: "day-1",
          placeId: "place-1",
          position: 0,
          version: 1
        },
        {
          id: "middle",
          dayId: "day-1",
          placeId: "place-2",
          position: 1,
          version: 1
        },
        {
          id: "last",
          dayId: "day-1",
          placeId: "place-3",
          position: 2,
          version: 1
        },
        {
          id: "other-day",
          dayId: "day-2",
          placeId: "place-4",
          position: 0,
          version: 1
        }
      ],
      routes: [],
      lodgings: []
    };
  }

  function withRevision(snapshot: TripSnapshot, revision: number): TripSnapshot {
    return {
      ...snapshot,
      room: {
        ...snapshot.room,
        revision
      }
    };
  }

  function configureStore(): TripRoomStore {
    TestBed.configureTestingModule({
      providers: [TripRoomStore, provideHttpClient(), provideHttpClientTesting()]
    });
    return TestBed.inject(TripRoomStore);
  }

  function connectSocket(store: TripRoomStore): string[] {
    const sentMessages: string[] = [];
    (store as unknown as { socket: Pick<WebSocket, "readyState" | "send"> }).socket = {
      readyState: WebSocket.OPEN,
      send: (message: string | ArrayBufferLike | Blob | ArrayBufferView) => {
        sentMessages.push(String(message));
      }
    };
    return sentMessages;
  }

  it("returns day items in timeline order", () => {
    const store = configureStore();
    store.setSnapshot({
      room: {
        id: "trip-1",
        ownerUserId: "owner",
        title: "Viagem",
        destination: "Destino",
        startDate: "2026-10-12",
        endDate: "2026-10-12",
        timezone: "UTC",
        publicShareToken: "share-token",
        revision: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      },
      currentMemberRole: "owner",
      members: [],
      days: [{ id: "day-1", date: "2026-10-12", position: 0 }],
      places: [],
      items: [
        {
          id: "later",
          dayId: "day-1",
          placeId: "place-2",
          position: 1,
          version: 1
        },
        {
          id: "first",
          dayId: "day-1",
          placeId: "place-1",
          position: 0,
          version: 1
        }
      ],
      routes: [],
      lodgings: []
    } satisfies TripSnapshot);

    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["first", "later"]);
  });

  it("optimistically reorders an item in the same day before the server snapshot arrives", () => {
    const store = configureStore();
    const sentMessages = connectSocket(store);
    store.setSnapshot(createSnapshot());

    store.moveItem(store.itemsForDay("day-1")[1], "day-1", 0);

    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["middle", "first", "last"]);
    expect(store.pending()).toBe(1);
    expect(sentMessages.length).toBe(1);
  });

  it("optimistically moves an item to another day before the server snapshot arrives", () => {
    const store = configureStore();
    connectSocket(store);
    store.setSnapshot(createSnapshot());

    store.moveItem(store.itemsForDay("day-1")[0], "day-2", 1);

    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["middle", "last"]);
    expect(store.itemsForDay("day-2").map((item) => item.id)).toEqual(["other-day", "first"]);
  });

  it("optimistically adds a library place to the end of a day", () => {
    const store = configureStore();
    store.setSnapshot(createSnapshot());

    const rollbackSnapshot = store.addItemOptimistically("day-2", "place-5");

    expect(rollbackSnapshot?.items.length).toBe(4);
    expect(store.itemsForDay("day-2").map((item) => item.placeId)).toEqual(["place-4", "place-5"]);
    expect(store.itemsForDay("day-2")[1].id).toMatch(/^optimistic-/);
    expect(store.itemsForDay("day-2")[1].position).toBe(1);
  });

  it("optimistically removes a day item and renumbers the remaining day items", () => {
    const store = configureStore();
    store.setSnapshot({
      ...createSnapshot(),
      routes: [{
        id: "route-1",
        fromItemId: "first",
        fromLodgingId: null,
        toItemId: "middle",
        toLodgingId: null,
        transportMode: "walk",
        version: 1
      }]
    });

    const rollbackSnapshot = store.removeItemOptimistically("middle");

    expect(rollbackSnapshot?.items.length).toBe(4);
    expect(store.itemsForDay("day-1").map((item) => `${item.id}:${item.position}`))
      .toEqual(["first:0", "last:1"]);
    expect(store.snapshot()?.routes).toEqual([]);
  });

  it("rolls back an optimistic move when the server rejects the operation", () => {
    const store = configureStore();
    const sentMessages = connectSocket(store);
    store.setSnapshot(createSnapshot());

    store.moveItem(store.itemsForDay("day-1")[1], "day-2", 1);
    const operationId = JSON.parse(sentMessages[0]).operation.operationId as string;
    (store as unknown as { handleMessage(raw: string): void }).handleMessage(JSON.stringify({
      type: "operation_error",
      operationId,
      status: 409,
      error: "entity_version_conflict"
    }));

    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["first", "middle", "last"]);
    expect(store.itemsForDay("day-2").map((item) => item.id)).toEqual(["other-day"]);
    expect(store.pending()).toBe(0);
  });

  it("ignores invalid websocket frames", () => {
    const store = configureStore();
    store.setSnapshot(createSnapshot());

    expect(() => (store as unknown as { handleMessage(raw: string): void }).handleMessage("{invalid")).not.toThrow();
    expect(() => (store as unknown as { handleMessage(raw: string): void }).handleMessage(JSON.stringify({
      type: "unknown_event",
      snapshot: withRevision(createSnapshot(), 2)
    }))).not.toThrow();

    expect(store.snapshot()?.room.revision).toBe(1);
  });

  it("parses only known realtime event shapes", () => {
    expect(parseTripRealtimeEvent(JSON.stringify({
      type: "presence_update",
      userId: "user-1",
      selectedItemId: "item-1"
    }))).toEqual({
      type: "presence_update",
      userId: "user-1",
      selectedItemId: "item-1"
    });

    expect(parseTripRealtimeEvent("{invalid")).toBeNull();
    expect(parseTripRealtimeEvent(JSON.stringify({ type: "presence_update", userId: "" }))).toBeNull();
    expect(parseTripRealtimeEvent(JSON.stringify({ type: "unsupported" }))).toBeNull();
  });

  it("ignores websocket snapshots older than the current revision", () => {
    const store = configureStore();
    store.setSnapshot(withRevision({
      ...createSnapshot(),
      items: [{
        id: "current",
        dayId: "day-1",
        placeId: "place-current",
        position: 0,
        version: 1
      }]
    }, 3));

    (store as unknown as { handleMessage(raw: string): void }).handleMessage(JSON.stringify({
      type: "snapshot",
      snapshot: withRevision(createSnapshot(), 2)
    }));

    expect(store.snapshot()?.room.revision).toBe(3);
    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["current"]);
  });

  it("does not let same-revision websocket snapshots clobber pending optimistic state", () => {
    const store = configureStore();
    connectSocket(store);
    store.setSnapshot(createSnapshot());

    store.moveItem(store.itemsForDay("day-1")[1], "day-2", 1);
    (store as unknown as { handleMessage(raw: string): void }).handleMessage(JSON.stringify({
      type: "snapshot",
      snapshot: createSnapshot()
    }));

    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["first", "last"]);
    expect(store.itemsForDay("day-2").map((item) => item.id)).toEqual(["other-day", "middle"]);
  });

  it("coalesces server snapshots while a snapshot batch is active", () => {
    const store = configureStore();
    store.setSnapshot(createSnapshot());
    const firstBatchSnapshot = withRevision({
      ...createSnapshot(),
      items: [{
        id: "first-batch",
        dayId: "day-1",
        placeId: "place-first-batch",
        position: 0,
        version: 1
      }]
    }, 2);
    const finalBatchSnapshot = withRevision({
      ...createSnapshot(),
      items: [{
        id: "final-batch",
        dayId: "day-1",
        placeId: "place-final-batch",
        position: 0,
        version: 1
      }]
    }, 3);

    store.beginSnapshotBatch();
    store.setSnapshot(firstBatchSnapshot);
    (store as unknown as { handleMessage(raw: string): void }).handleMessage(JSON.stringify({
      type: "snapshot",
      snapshot: finalBatchSnapshot
    }));

    expect(store.snapshot()?.room.revision).toBe(1);
    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["first", "middle", "last"]);

    store.endSnapshotBatch();

    expect(store.snapshot()?.room.revision).toBe(3);
    expect(store.itemsForDay("day-1").map((item) => item.id)).toEqual(["final-batch"]);
  });
});
