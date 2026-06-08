import { describe, expect, it } from "vitest";
import { applyTipToItems, assertExpenseParticipantCanBeDeleted, calculateBalances, calculateItemSplits, calculateParticipantTotals, calculateTipAmountCents, optimizeSettlements } from "../src/index";

describe("expense calculations", () => {
  it("splits cents by share units with deterministic remainder distribution", () => {
    expect(calculateItemSplits(1000, [
      { participantId: "ana", shareUnits: 2 },
      { participantId: "bruno", shareUnits: 1 },
      { participantId: "caio", shareUnits: 1 }
    ])).toEqual([
      { participantId: "ana", shareUnits: 2, amountCents: 500 },
      { participantId: "bruno", shareUnits: 1, amountCents: 250 },
      { participantId: "caio", shareUnits: 1, amountCents: 250 }
    ]);

    expect(calculateItemSplits(100, [
      { participantId: "ana", shareUnits: 1 },
      { participantId: "bruno", shareUnits: 1 },
      { participantId: "caio", shareUnits: 1 }
    ])).toEqual([
      { participantId: "ana", shareUnits: 1, amountCents: 34 },
      { participantId: "bruno", shareUnits: 1, amountCents: 33 },
      { participantId: "caio", shareUnits: 1, amountCents: 33 }
    ]);
  });

  it("optimizes settlements from net balances", () => {
    const balances = calculateBalances(["ana", "bruno", "caio"], [
      {
        payerParticipantId: "ana",
        amountCents: 9000,
        splits: [
          { participantId: "ana", shareUnits: 1, amountCents: 3000 },
          { participantId: "bruno", shareUnits: 1, amountCents: 3000 },
          { participantId: "caio", shareUnits: 1, amountCents: 3000 }
        ]
      },
      {
        payerParticipantId: "bruno",
        amountCents: 3000,
        splits: [
          { participantId: "ana", shareUnits: 1, amountCents: 1000 },
          { participantId: "bruno", shareUnits: 1, amountCents: 1000 },
          { participantId: "caio", shareUnits: 1, amountCents: 1000 }
        ]
      }
    ]);

    expect(optimizeSettlements(balances)).toEqual([
      { fromParticipantId: "caio", toParticipantId: "ana", amountCents: 4000 },
      { fromParticipantId: "bruno", toParticipantId: "ana", amountCents: 1000 }
    ]);
  });

  it("treats an establishment payer like any other participant in balances", () => {
    const balances = calculateBalances(["establishment", "ana", "bruno"], [
      {
        payerParticipantId: "establishment",
        amountCents: 6000,
        splits: [
          { participantId: "ana", shareUnits: 1, amountCents: 3000 },
          { participantId: "bruno", shareUnits: 1, amountCents: 3000 }
        ]
      }
    ]);

    expect(optimizeSettlements(balances)).toEqual([
      { fromParticipantId: "ana", toParticipantId: "establishment", amountCents: 3000 },
      { fromParticipantId: "bruno", toParticipantId: "establishment", amountCents: 3000 }
    ]);
  });

  it("calculates subtotal-free tips as zero", () => {
    expect(calculateTipAmountCents(0, 10)).toBe(0);
    expect(calculateParticipantTotals(["ana"], [], 0)).toEqual([
      { participantId: "ana", subtotalCents: 0, tipAmountCents: 0, totalCents: 0 }
    ]);
  });

  it("adds tips to participant totals and settlements", () => {
    const items = [
      {
        payerParticipantId: "ana",
        amountCents: 1000,
        splits: [
          { participantId: "ana", shareUnits: 1, amountCents: 500 },
          { participantId: "bruno", shareUnits: 1, amountCents: 500 }
        ]
      }
    ];
    const tipAmountCents = calculateTipAmountCents(1000, 10);

    expect(tipAmountCents).toBe(100);
    expect(calculateParticipantTotals(["ana", "bruno"], items, tipAmountCents)).toEqual([
      { participantId: "ana", subtotalCents: 500, tipAmountCents: 50, totalCents: 550 },
      { participantId: "bruno", subtotalCents: 500, tipAmountCents: 50, totalCents: 550 }
    ]);

    const balances = calculateBalances(["ana", "bruno"], applyTipToItems(items, tipAmountCents));

    expect(optimizeSettlements(balances)).toEqual([
      { fromParticipantId: "bruno", toParticipantId: "ana", amountCents: 550 }
    ]);
  });
});

describe("expense participant deletion", () => {
  function dbWithLinkedRows(rows: unknown[]) {
    return {
      execute: async () => ({ rows })
    };
  }

  it("allows deleting guests and logged users without links", async () => {
    await expect(assertExpenseParticipantCanBeDeleted(dbWithLinkedRows([]) as never, "room-1", {
      id: "guest-1",
      role: "guest"
    })).resolves.toBeUndefined();

    await expect(assertExpenseParticipantCanBeDeleted(dbWithLinkedRows([]) as never, "room-1", {
      id: "user-1",
      role: "member"
    })).resolves.toBeUndefined();
  });

  it("blocks deleting the owner participant", async () => {
    await expect(assertExpenseParticipantCanBeDeleted(dbWithLinkedRows([]) as never, "room-1", {
      id: "owner-1",
      role: "owner"
    })).rejects.toMatchObject({
      status: 403,
      message: "cannot_delete_owner_participant"
    });
  });

  it("blocks deleting participants linked to expenses, splits or paid settlements", async () => {
    await expect(assertExpenseParticipantCanBeDeleted(dbWithLinkedRows([{ linked: 1 }]) as never, "room-1", {
      id: "member-1",
      role: "member"
    })).rejects.toMatchObject({
      status: 409,
      message: "participant_has_expense_links"
    });
  });
});
