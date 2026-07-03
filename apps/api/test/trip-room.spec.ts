import { describe, expect, it } from "vitest";
import { parseTripClientMessage } from "../src/trip-room";

describe("trip room websocket contract", () => {
  it("normalizes a valid move operation", () => {
    const parsed = parseTripClientMessage(JSON.stringify({
      type: "move_item",
      operation: {
        operationId: "operation-1",
        type: "move_item",
        entityVersion: 3,
        itemId: "item-1",
        targetDayId: "day-2",
        targetPosition: 1
      }
    }));

    expect(parsed).toEqual({
      ok: true,
      message: {
        type: "move_item",
        operation: {
          operationId: "operation-1",
          type: "move_item",
          entityVersion: 3,
          itemId: "item-1",
          targetDayId: "day-2",
          targetPosition: 1
        }
      }
    });
  });

  it("rejects malformed move operations while preserving a valid operation id", () => {
    const parsed = parseTripClientMessage(JSON.stringify({
      type: "move_item",
      operation: {
        operationId: "operation-1",
        type: "move_item",
        entityVersion: 3,
        itemId: "item-1",
        targetDayId: "day-2",
        targetPosition: -1
      }
    }));

    expect(parsed).toEqual({
      ok: false,
      error: "invalid_target_position",
      operationId: "operation-1"
    });
  });

  it("rejects invalid JSON before touching the operation handler", () => {
    expect(parseTripClientMessage("{invalid")).toEqual({
      ok: false,
      error: "invalid_json"
    });
  });

  it("validates presence selection ids", () => {
    expect(parseTripClientMessage(JSON.stringify({
      type: "presence",
      selectedItemId: "item-1"
    }))).toEqual({
      ok: true,
      message: {
        type: "presence",
        selectedItemId: "item-1"
      }
    });

    expect(parseTripClientMessage(JSON.stringify({
      type: "presence",
      selectedItemId: ""
    }))).toEqual({
      ok: false,
      error: "invalid_selected_item"
    });
  });
});
