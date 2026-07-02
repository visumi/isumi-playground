import { Injectable, computed, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { TripDayItem, TripSnapshot } from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";

export interface TripPresence {
  userId: string;
  name: string;
  picture: string | null;
}

@Injectable()
export class TripRoomStore {
  private readonly trips = inject(TripsService);
  private readonly snapshotState = signal<TripSnapshot | null>(null);
  private readonly connectionState = signal<"offline" | "connecting" | "online" | "reconnecting">("offline");
  private readonly presenceState = signal<TripPresence[]>([]);
  private readonly editingState = signal<Record<string, string | null>>({});
  private readonly pendingState = signal(0);
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private closedIntentionally = false;
  private localDragActive = false;
  private queuedSnapshot: TripSnapshot | null = null;
  private snapshotBatchDepth = 0;
  private batchedSnapshot: TripSnapshot | null = null;
  private batchedSnapshotForce = false;
  private readonly pendingOptimisticSnapshots = new Map<string, TripSnapshot>();

  readonly snapshot = this.snapshotState.asReadonly();
  readonly connection = this.connectionState.asReadonly();
  readonly presence = this.presenceState.asReadonly();
  readonly editing = this.editingState.asReadonly();
  readonly pending = this.pendingState.asReadonly();
  readonly room = computed(() => this.snapshotState()?.room || null);
  readonly days = computed(() => this.snapshotState()?.days || []);
  readonly places = computed(() => this.snapshotState()?.places || []);
  readonly routes = computed(() => this.snapshotState()?.routes || []);
  readonly lodgings = computed(() => this.snapshotState()?.lodgings || []);

  itemsForDay(dayId: string): TripDayItem[] {
    return (this.snapshotState()?.items || [])
      .filter((item) => item.dayId === dayId)
      .sort((a, b) => a.position - b.position);
  }

  async load(roomId: string): Promise<void> {
    this.roomId = roomId;
    this.applyServerSnapshot(await firstValueFrom(this.trips.get(roomId)), true);
  }

  setSnapshot(snapshot: TripSnapshot): void {
    this.applyServerSnapshot(snapshot);
  }

  beginLocalDrag(): void {
    this.localDragActive = true;
    this.queuedSnapshot = null;
  }

  endLocalDrag(): void {
    this.localDragActive = false;
    if (this.queuedSnapshot) {
      this.applyServerSnapshot(this.queuedSnapshot);
      this.queuedSnapshot = null;
    }
  }

  async connect(): Promise<void> {
    if (!this.roomId || this.socket?.readyState === WebSocket.OPEN) return;
    this.closedIntentionally = false;
    this.connectionState.set(this.reconnectAttempt ? "reconnecting" : "connecting");

    try {
      const ticket = await firstValueFrom(this.trips.realtimeTicket(this.roomId));
      const socket = new WebSocket(this.trips.realtimeUrl(this.roomId, ticket.token));
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.reconnectAttempt = 0;
        this.connectionState.set("online");
      });
      socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
      socket.addEventListener("close", () => this.handleClose());
      socket.addEventListener("error", () => socket.close());
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.closedIntentionally = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, "navigation");
    this.socket = null;
    this.connectionState.set("offline");
    this.presenceState.set([]);
    this.editingState.set({});
    this.localDragActive = false;
    this.queuedSnapshot = null;
    this.snapshotBatchDepth = 0;
    this.batchedSnapshot = null;
    this.batchedSnapshotForce = false;
    this.pendingOptimisticSnapshots.clear();
  }

  moveItem(item: TripDayItem, targetDayId: string, targetPosition: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const operationId = crypto.randomUUID();
    const snapshotBeforeMove = this.snapshotState();
    if (snapshotBeforeMove) {
      this.pendingOptimisticSnapshots.set(operationId, snapshotBeforeMove);
      this.applyOptimisticMove(item.id, targetDayId, targetPosition);
    }
    this.pendingState.update((count) => count + 1);
    this.socket.send(JSON.stringify({
      type: "move_item",
      operation: {
        operationId,
        type: "move_item",
        entityVersion: item.version,
        itemId: item.id,
        targetDayId,
        targetPosition
      }
    }));
  }

  addItemOptimistically(dayId: string, placeId: string): TripSnapshot | null {
    const snapshot = this.snapshotState();
    if (!snapshot || !snapshot.days.some((day) => day.id === dayId)) return null;

    const optimisticItem: TripDayItem = {
      id: `optimistic-${crypto.randomUUID()}`,
      dayId,
      placeId,
      position: this.orderedItemsForSnapshot(snapshot, dayId).length,
      version: 0
    };
    this.queuedSnapshot = null;
    this.snapshotState.set({ ...snapshot, items: [...snapshot.items, optimisticItem] });
    return snapshot;
  }

  removeItemOptimistically(itemId: string): TripSnapshot | null {
    const snapshot = this.snapshotState();
    const removedItem = snapshot?.items.find((item) => item.id === itemId);
    if (!snapshot || !removedItem) return null;

    const remainingItems = snapshot.items.filter((item) => item.id !== itemId);
    const sourceOrder = remainingItems
      .filter((item) => item.dayId === removedItem.dayId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const optimisticItems = remainingItems.map((item) => {
      const sourceIndex = sourceOrder.findIndex((sourceItem) => sourceItem.id === item.id);
      return sourceIndex >= 0 ? { ...item, position: sourceIndex } : item;
    });
    const optimisticRoutes = snapshot.routes.filter((route) =>
      route.fromItemId !== itemId && route.toItemId !== itemId
    );

    this.queuedSnapshot = null;
    this.snapshotState.set({ ...snapshot, items: optimisticItems, routes: optimisticRoutes });
    return snapshot;
  }

  restoreSnapshot(snapshot: TripSnapshot | null): void {
    if (!snapshot) return;
    this.queuedSnapshot = null;
    this.snapshotState.set(snapshot);
  }

  beginSnapshotBatch(): void {
    this.snapshotBatchDepth += 1;
  }

  endSnapshotBatch(): void {
    this.snapshotBatchDepth = Math.max(0, this.snapshotBatchDepth - 1);
    if (this.snapshotBatchDepth > 0 || !this.batchedSnapshot) return;
    const snapshot = this.batchedSnapshot;
    const force = this.batchedSnapshotForce;
    this.batchedSnapshot = null;
    this.batchedSnapshotForce = false;
    this.applyServerSnapshot(snapshot, force);
  }

  selectItem(itemId: string | null): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "presence", selectedItemId: itemId }));
    }
  }

  private handleMessage(raw: string): void {
    const event = JSON.parse(raw) as {
      type: string;
      snapshot?: TripSnapshot;
      members?: TripPresence[];
      userId?: string;
      selectedItemId?: string | null;
      operationId?: string;
      error?: string;
      status?: number;
    };
    if (event.type === "snapshot" && event.snapshot) {
      this.applyServerSnapshot(event.snapshot);
    }
    if (event.type === "presence" && event.members) this.presenceState.set(event.members);
    if (event.type === "presence_update" && event.userId) {
      this.editingState.update((state) => ({ ...state, [event.userId as string]: event.selectedItemId || null }));
    }
    if (event.type === "operation_ack") {
      if (event.operationId) this.pendingOptimisticSnapshots.delete(event.operationId);
      this.pendingState.update((count) => Math.max(0, count - 1));
    }
    if (event.type === "operation_error") {
      this.pendingState.update((count) => Math.max(0, count - 1));
      this.rollbackOptimisticMove(event.operationId);
      if (event.status === 409 && this.roomId) void this.load(this.roomId);
    }
  }

  private applyOptimisticMove(itemId: string, targetDayId: string, targetPosition: number): void {
    const snapshot = this.snapshotState();
    const movingItem = snapshot?.items.find((item) => item.id === itemId);
    if (!snapshot || !movingItem || !snapshot.days.some((day) => day.id === targetDayId)) return;

    const sourceDayId = movingItem.dayId;
    const sourceOrder = this.orderedItemsForSnapshot(snapshot, sourceDayId)
      .filter((item) => item.id !== itemId);
    const targetOrder = sourceDayId === targetDayId
      ? sourceOrder
      : this.orderedItemsForSnapshot(snapshot, targetDayId).filter((item) => item.id !== itemId);
    const normalizedPosition = Math.min(targetOrder.length, Math.max(0, Math.trunc(targetPosition)));
    targetOrder.splice(normalizedPosition, 0, { ...movingItem, dayId: targetDayId, position: normalizedPosition });

    const optimisticItems = snapshot.items.map((item) => {
      const sourceIndex = sourceOrder.findIndex((sourceItem) => sourceItem.id === item.id);
      if (sourceIndex >= 0) return { ...item, position: sourceIndex };

      const targetIndex = targetOrder.findIndex((targetItem) => targetItem.id === item.id);
      if (targetIndex >= 0) return { ...item, dayId: targetDayId, position: targetIndex };

      return item;
    });

    this.queuedSnapshot = null;
    this.snapshotState.set({ ...snapshot, items: optimisticItems });
  }

  private orderedItemsForSnapshot(snapshot: TripSnapshot, dayId: string): TripDayItem[] {
    return snapshot.items
      .filter((item) => item.dayId === dayId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }

  private rollbackOptimisticMove(operationId: string | undefined): void {
    const snapshot = operationId ? this.pendingOptimisticSnapshots.get(operationId) : null;
    if (operationId) this.pendingOptimisticSnapshots.delete(operationId);
    if (snapshot) {
      this.snapshotState.set(snapshot);
      return;
    }
    const firstSnapshot = this.pendingOptimisticSnapshots.values().next().value;
    this.pendingOptimisticSnapshots.clear();
    if (firstSnapshot) this.snapshotState.set(firstSnapshot);
  }

  private applyServerSnapshot(snapshot: TripSnapshot, force = false): void {
    if (!force && !this.shouldAcceptServerSnapshot(snapshot)) return;
    if (this.snapshotBatchDepth > 0) {
      if (!this.batchedSnapshot || force || snapshot.room.revision >= this.batchedSnapshot.room.revision) {
        this.batchedSnapshot = snapshot;
        this.batchedSnapshotForce = this.batchedSnapshotForce || force;
      }
      return;
    }
    if (this.localDragActive) {
      if (!this.queuedSnapshot || snapshot.room.revision >= this.queuedSnapshot.room.revision) {
        this.queuedSnapshot = snapshot;
      }
      return;
    }
    this.snapshotState.set(snapshot);
  }

  private shouldAcceptServerSnapshot(snapshot: TripSnapshot): boolean {
    const current = this.snapshotState();
    if (!current) return true;
    if (snapshot.room.revision > current.room.revision) return true;
    if (snapshot.room.revision < current.room.revision) return false;
    return this.pendingOptimisticSnapshots.size === 0;
  }

  private handleClose(): void {
    this.socket = null;
    if (this.closedIntentionally) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closedIntentionally) return;
    this.connectionState.set("reconnecting");
    const delay = Math.min(30_000, 750 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(async () => {
      if (this.roomId) {
        try {
          await this.load(this.roomId);
        } finally {
          void this.connect();
        }
      }
    }, delay);
  }
}
