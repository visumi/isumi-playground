import { describe, expect, it } from "vitest";
import { assertExpenseItemPaymentCanBeUpdated, assertExpenseParticipantCanBeDeleted, calculateBalances, calculateItemSplits, calculateParticipantTotals, optimizeSettlements } from "../src/index";

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

  it("calculates participant totals from item splits", () => {
    expect(calculateParticipantTotals(["ana"], [])).toEqual([
      { participantId: "ana", subtotalCents: 0, totalCents: 0 }
    ]);

    expect(calculateParticipantTotals(["ana", "bruno"], [{
      splits: [
        { participantId: "ana", shareUnits: 1, amountCents: 500 },
        { participantId: "bruno", shareUnits: 1, amountCents: 500 }
      ]
    }])).toEqual([
      { participantId: "ana", subtotalCents: 500, totalCents: 500 },
      { participantId: "bruno", subtotalCents: 500, totalCents: 500 }
    ]);
  });

  it("removes only paid participant shares from balances", () => {
    expect(calculateBalances(["payer", "ana", "bruno"], [{
      payerParticipantId: "payer",
      amountCents: 3000,
      splits: [
        { participantId: "payer", shareUnits: 1, amountCents: 1000, paid: true },
        { participantId: "ana", shareUnits: 1, amountCents: 1000, paid: true },
        { participantId: "bruno", shareUnits: 1, amountCents: 1000, paid: false }
      ]
    }])).toEqual([
      { participantId: "payer", balanceCents: 1000 },
      { participantId: "bruno", balanceCents: -1000 }
    ]);
  });

  it("clears all balances when every non-payer share is paid", () => {
    expect(calculateBalances(["payer", "ana"], [{
      payerParticipantId: "payer",
      amountCents: 2000,
      splits: [
        { participantId: "payer", shareUnits: 1, amountCents: 1000, paid: true },
        { participantId: "ana", shareUnits: 1, amountCents: 1000, paid: true }
      ]
    }])).toEqual([]);
  });
});

describe("expense item payment permissions", () => {
  it("allows a participant to update their own share", () => {
    expect(() => assertExpenseItemPaymentCanBeUpdated("ana-user", {
      id: "ana",
      user_id: "ana-user"
    }, "payer")).not.toThrow();
  });

  it("allows any room member to update a guest share", () => {
    expect(() => assertExpenseItemPaymentCanBeUpdated("member-user", {
      id: "guest",
      user_id: null
    }, "payer")).not.toThrow();
  });

  it("rejects updating another authenticated participant share", () => {
    expect(() => assertExpenseItemPaymentCanBeUpdated("other-user", {
      id: "ana",
      user_id: "ana-user"
    }, "payer")).toThrowError(expect.objectContaining({
      status: 403,
      message: "participant_payment_owner_required"
    }));
  });

  it("rejects manually updating the payer share", () => {
    expect(() => assertExpenseItemPaymentCanBeUpdated("payer-user", {
      id: "payer",
      user_id: "payer-user"
    }, "payer")).toThrowError(expect.objectContaining({
      status: 400,
      message: "payer_payment_automatic"
    }));
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
