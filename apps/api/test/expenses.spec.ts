import { describe, expect, it } from "vitest";
import { calculateBalances, calculateItemSplits, optimizeSettlements } from "../src/index";

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
      { fromParticipantId: "caio", toParticipantId: "ana", amountCents: 4000 }
    ]);
  });
});
