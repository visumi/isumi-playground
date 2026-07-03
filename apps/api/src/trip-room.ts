import { DurableObject } from "cloudflare:workers";
import { createDatabaseClient, type Env, HttpError } from "./shared";
import { applyTripMoveOperation, type TripMoveOperation } from "./trips";

interface ConnectionState {
  roomId: string;
  userId: string;
  name: string;
  picture: string | null;
}

type ClientMessage =
  | { type: "presence"; selectedItemId: string | null }
  | { type: "move_item"; operation: TripMoveOperation };

type ParsedClientMessage =
  | { ok: true; message: ClientMessage }
  | { ok: false; error: string; operationId?: string };

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
      this.sendOperationError(ws, 400, "invalid_message");
      return;
    }

    let operationId: string | undefined;
    try {
      const parsed = parseTripClientMessage(message);
      if (!parsed.ok) {
        this.sendOperationError(ws, 400, parsed.error, parsed.operationId);
        return;
      }
      const connection = ws.deserializeAttachment() as ConnectionState;

      operationId = parsed.message.type === "move_item" ? parsed.message.operation.operationId : undefined;

      if (parsed.message.type === "presence") {
        this.broadcast({
          type: "presence_update",
          userId: connection.userId,
          selectedItemId: parsed.message.selectedItemId || null
        });
        return;
      }

      if (parsed.message.type === "move_item") {
        const db = createDatabaseClient(this.env);
        const snapshot = await applyTripMoveOperation(db, connection.userId, connection.roomId, parsed.message.operation);
        this.broadcast({ type: "snapshot", snapshot, actorUserId: connection.userId });
        ws.send(JSON.stringify({ type: "operation_ack", operationId }));
        return;
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof Error ? error.message : "internal_server_error";
      this.sendOperationError(ws, status, code, operationId);
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

  private sendOperationError(ws: WebSocket, status: number, error: string, operationId?: string): void {
    ws.send(JSON.stringify({
      type: "operation_error",
      status,
      error,
      ...(operationId ? { operationId } : {})
    }));
  }
}

export function parseTripClientMessage(raw: string): ParsedClientMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  if (!isRecord(parsed)) return { ok: false, error: "invalid_message" };
  const operationId = readValidId(parsed["operationId"]);

  if (parsed["type"] === "presence") {
    const selectedItemId = parsed["selectedItemId"];
    if (selectedItemId !== undefined && selectedItemId !== null && !readValidId(selectedItemId)) {
      return { ok: false, error: "invalid_selected_item" };
    }
    return {
      ok: true,
      message: {
        type: "presence",
        selectedItemId: readValidId(selectedItemId) || null
      }
    };
  }

  if (parsed["type"] !== "move_item") {
    return { ok: false, error: "unsupported_message", operationId };
  }

  const operation = parsed["operation"];
  if (!isRecord(operation)) return { ok: false, error: "invalid_operation", operationId };
  const nestedOperationId = readValidId(operation["operationId"]);
  const validOperationId = nestedOperationId || operationId;
  if (!nestedOperationId) return { ok: false, error: "missing_operation_id", operationId: validOperationId };
  if (operation["type"] !== "move_item") return { ok: false, error: "invalid_operation_type", operationId: validOperationId };

  const itemId = readValidId(operation["itemId"]);
  if (!itemId) return { ok: false, error: "missing_item", operationId: validOperationId };
  const targetDayId = readValidId(operation["targetDayId"]);
  if (!targetDayId) return { ok: false, error: "missing_day", operationId: validOperationId };
  const entityVersion = readValidInteger(operation["entityVersion"], 1, Number.MAX_SAFE_INTEGER);
  if (entityVersion === null) return { ok: false, error: "missing_entity_version", operationId: validOperationId };
  const targetPosition = readValidInteger(operation["targetPosition"], 0, 10_000);
  if (targetPosition === null) return { ok: false, error: "invalid_target_position", operationId: validOperationId };

  return {
    ok: true,
    message: {
      type: "move_item",
      operation: {
        operationId: nestedOperationId,
        type: "move_item",
        entityVersion,
        itemId,
        targetDayId,
        targetPosition
      }
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readValidId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 64 ? normalized : null;
}

function readValidInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}
