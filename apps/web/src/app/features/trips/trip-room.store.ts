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

  readonly snapshot = this.snapshotState.asReadonly();
  readonly connection = this.connectionState.asReadonly();
  readonly presence = this.presenceState.asReadonly();
  readonly editing = this.editingState.asReadonly();
  readonly pending = this.pendingState.asReadonly();
  readonly room = computed(() => this.snapshotState()?.room || null);
  readonly days = computed(() => this.snapshotState()?.days || []);
  readonly places = computed(() => this.snapshotState()?.places || []);
  readonly routes = computed(() => this.snapshotState()?.routes || []);
  readonly flights = computed(() => this.snapshotState()?.flights || []);
  readonly lodgings = computed(() => this.snapshotState()?.lodgings || []);

  itemsForDay(dayId: string): TripDayItem[] {
    return (this.snapshotState()?.items || [])
      .filter((item) => item.dayId === dayId)
      .sort((a, b) => a.position - b.position);
  }

  async load(roomId: string): Promise<void> {
    this.roomId = roomId;
    this.snapshotState.set(await firstValueFrom(this.trips.get(roomId)));
  }

  setSnapshot(snapshot: TripSnapshot): void {
    if (this.localDragActive) this.queuedSnapshot = snapshot;
    else this.snapshotState.set(snapshot);
  }

  beginLocalDrag(): void {
    this.localDragActive = true;
    this.queuedSnapshot = null;
  }

  endLocalDrag(): void {
    this.localDragActive = false;
    if (this.queuedSnapshot) {
      this.snapshotState.set(this.queuedSnapshot);
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
  }

  moveItem(item: TripDayItem, targetDayId: string, targetPosition: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.pendingState.update((count) => count + 1);
    this.socket.send(JSON.stringify({
      type: "move_item",
      operation: {
        operationId: crypto.randomUUID(),
        type: "move_item",
        entityVersion: item.version,
        itemId: item.id,
        targetDayId,
        targetPosition
      }
    }));
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
      if (this.localDragActive) this.queuedSnapshot = event.snapshot;
      else this.snapshotState.set(event.snapshot);
    }
    if (event.type === "presence" && event.members) this.presenceState.set(event.members);
    if (event.type === "presence_update" && event.userId) {
      this.editingState.update((state) => ({ ...state, [event.userId as string]: event.selectedItemId || null }));
    }
    if (event.type === "operation_ack") this.pendingState.update((count) => Math.max(0, count - 1));
    if (event.type === "operation_error") {
      this.pendingState.update((count) => Math.max(0, count - 1));
      if (event.status === 409 && this.roomId) void this.load(this.roomId);
    }
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
