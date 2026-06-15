import { describe, expect, it } from "vitest";
import { calculateMonthlyExpenseSummary, parseMonthlyExpenseCsv, serializeMonthlyExpenseCsv, splitInstallmentAmounts } from "../src/index";

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
