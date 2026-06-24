import { DurableObject } from "cloudflare:workers";
import { createDatabaseClient, type Env, HttpError } from "./shared";
import { applyTripMoveOperation, type TripMoveOperation } from "./trips";

interface ConnectionState {
  roomId: string;
  userId: string;
  name: string;
  picture: string | null;
}

interface ClientMessage {
  type: "presence" | "move_item";
  selectedItemId?: string | null;
  operation?: TripMoveOperation;
}

export class TripRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Upgrade required", { status: 426 });
    }
    const roomId = request.headers.get("X-Trip-Room");
    const userId = request.headers.get("X-Trip-User");
    const name = request.headers.get("X-Trip-Name");
    if (!roomId || !userId || !name) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      roomId,
      userId,
      name,
      picture: request.headers.get("X-Trip-Picture")
    } satisfies ConnectionState);

    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcastSnapshot(snapshot: unknown, actorUserId?: string): Promise<void> {
    this.broadcast({ type: "snapshot", snapshot, actorUserId });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 16_384) {
      ws.send(JSON.stringify({ type: "error", error: "invalid_message" }));
      return;
    }

    try {
      const parsed = JSON.parse(message) as ClientMessage;
      const connection = ws.deserializeAttachment() as ConnectionState;

      if (parsed.type === "presence") {
        this.broadcast({
          type: "presence_update",
          userId: connection.userId,
          selectedItemId: parsed.selectedItemId || null
        });
        return;
      }

      if (parsed.type === "move_item" && parsed.operation) {
        const db = createDatabaseClient(this.env);
        const snapshot = await applyTripMoveOperation(db, connection.userId, connection.roomId, parsed.operation);
        this.broadcast({ type: "snapshot", snapshot, actorUserId: connection.userId });
        ws.send(JSON.stringify({ type: "operation_ack", operationId: parsed.operation.operationId }));
        return;
      }

      ws.send(JSON.stringify({ type: "error", error: "unsupported_message" }));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof Error ? error.message : "internal_server_error";
      ws.send(JSON.stringify({ type: "operation_error", status, error: code }));
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
    this.broadcastPresence();
  }

  override async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    const members = this.ctx.getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN)
      .map((socket) => {
      const state = socket.deserializeAttachment() as ConnectionState;
      return {
        userId: state.userId,
        name: state.name,
        picture: state.picture
      };
      });
    this.broadcast({ type: "presence", members });
  }

  private broadcast(payload: unknown): void {
    const message = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A conexão será removida pelo runtime.
      }
    }
  }
}
