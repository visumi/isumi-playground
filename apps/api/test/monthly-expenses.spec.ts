import { describe, expect, it } from "vitest";
import {
  calculateMonthlyExpenseSummary,
  parseMonthlyExpenseCsv,
  parseShortcutMoneyAmount,
  sanitizeMonthlyExpenseShortcutPendingInput,
  serializeMonthlyExpenseCsv,
  splitInstallmentAmounts
} from "../src/index";

describe("monthly expense calculations", () => {
  it("calculates the monthly dashboard numbers", () => {
    expect(calculateMonthlyExpenseSummary({
      incomeCents: 1276307,
      variableLimitCents: 350000,
      items: [
        { amountCents: 722331, expenseType: "FIXO" },
        { amountCents: 151304, expenseType: "VARIAVEL" },
        { amountCents: 62000, expenseType: "RESERVA" }
      ]
    })).toEqual({
      incomeCents: 1276307,
      variableLimitCents: 350000,
      variableSpentCents: 151304,
      variableRemainingCents: 198696,
      fixedTotalCents: 722331,
      reserveTotalCents: 62000,
      monthTotalCents: 935635,
      unallocatedCents: 203976
    });
  });

  it("splits installment cents by putting remainders first", () => {
    expect(splitInstallmentAmounts(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallmentAmounts(82599, 2)).toEqual([41300, 41299]);
  });
});

describe("monthly expense CSV", () => {
  it("serializes and parses the editable monthly CSV columns", () => {
    const csv = serializeMonthlyExpenseCsv([{
      descricao: "Cinema, pipoca",
      categoria: "Lazer",
      valor_total: "100,00",
      numero_parcelas: "1",
      parcela_atual: "1",
      metodo_pagamento: "PIX",
      tipo: "VARIAVEL"
    }]);

    expect(parseMonthlyExpenseCsv(csv)).toEqual([{
      descricao: "Cinema, pipoca",
      categoria: "Lazer",
      valor_total: "100,00",
      numero_parcelas: "1",
      parcela_atual: "1",
      metodo_pagamento: "PIX",
      tipo: "VARIAVEL"
    }]);
  });
});

describe("monthly expense shortcut payload", () => {
  it("accepts only merchant and amount in the shortcut body", () => {
    const input = sanitizeMonthlyExpenseShortcutPendingInput({
      merchant: "Mercado Exemplo",
      amount: "R$ 45,90"
    });

    expect(input).toEqual({
      description: "Mercado Exemplo",
      amountCents: 4590,
      transactionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      merchantName: "Mercado Exemplo",
      sourceId: null
    });
  });

  it("rejects shortcut bodies with legacy or extra fields", () => {
    expect(() => sanitizeMonthlyExpenseShortcutPendingInput({
      merchant: "Mercado Exemplo",
      amount: "R$ 45,90",
      description: "Compra antiga"
    } as never)).toThrow("invalid_shortcut_payload");

    expect(() => sanitizeMonthlyExpenseShortcutPendingInput({
      Merchant: "Mercado Exemplo",
      amount: "R$ 45,90"
    } as never)).toThrow("invalid_shortcut_payload");

    expect(() => sanitizeMonthlyExpenseShortcutPendingInput({
      merchant: "Mercado Exemplo"
    } as never)).toThrow("invalid_shortcut_payload");
  });

  it("parses money strings sent by iPhone shortcuts", () => {
    expect(parseShortcutMoneyAmount("R$ 45,90")).toBe(4590);
    expect(parseShortcutMoneyAmount("$45.90")).toBe(4590);
    expect(parseShortcutMoneyAmount("R$ 1.234,56")).toBe(123456);
    expect(parseShortcutMoneyAmount("US$1,234.56")).toBe(123456);
  });

  it("rejects invalid money strings", () => {
    expect(() => parseShortcutMoneyAmount("R$ 0,00")).toThrow("invalid_amount");
    expect(() => parseShortcutMoneyAmount("sem valor")).toThrow("invalid_amount");
  });
});
