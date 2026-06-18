import { describe, expect, it } from "vitest";
import {
  calculateMonthlyExpenseSummary,
  migrateMonthlyFixedExpensesToNextMonth,
  type MonthlyExpenseMonthRow,
  parseMonthlyExpenseCsv,
  parseShortcutMoneyAmount,
  sanitizeMonthlyExpenseShortcutPendingInput,
  serializeMonthlyExpenseCsv,
  splitInstallmentAmounts
} from "../src/index";

type MonthlyExpenseItemRow = {
  id: string;
  user_id: string;
  month_id: string;
  category_id: string;
  payment_method_id: string;
  description: string;
  amount_cents: number;
  total_purchase_cents: number;
  installment_number: number;
  installment_total: number;
  expense_type: "FIXO" | "VARIAVEL" | "RESERVA";
  installment_group_id: string;
  created_at: string;
  updated_at: string;
};

function monthlyExpenseMonth(overrides: Partial<MonthlyExpenseMonthRow>): MonthlyExpenseMonthRow {
  return {
    id: "month-id",
    user_id: "user-1",
    year: 2026,
    month: 6,
    income_cents: 0,
    variable_limit_cents: 0,
    created_at: "2026-06-01 00:00:00",
    updated_at: "2026-06-01 00:00:00",
    ...overrides
  };
}

function monthlyExpenseItem(overrides: Partial<MonthlyExpenseItemRow>): MonthlyExpenseItemRow {
  return {
    id: "item-id",
    user_id: "user-1",
    month_id: "source-month",
    category_id: "category-1",
    payment_method_id: "payment-1",
    description: "Aluguel",
    amount_cents: 150000,
    total_purchase_cents: 150000,
    installment_number: 1,
    installment_total: 1,
    expense_type: "FIXO",
    installment_group_id: "original-group",
    created_at: "2026-06-01 00:00:00",
    updated_at: "2026-06-01 00:00:00",
    ...overrides
  };
}

function monthlyExpenseMigrationDb(initialMonths: MonthlyExpenseMonthRow[], initialItems: MonthlyExpenseItemRow[]) {
  const months = [...initialMonths];
  const items = [...initialItems];

  return {
    months,
    items,
    db: {
      execute: async ({ sql, args }: { sql: string; args: unknown[] }) => {
        if (sql.includes("FROM monthly_expense_months") && sql.includes("WHERE id = ?")) {
          const [monthId, userId] = args;
          return { rows: months.filter((item) => item.id === monthId && item.user_id === userId) };
        }

        if (sql.includes("FROM monthly_expense_months") && sql.includes("WHERE user_id = ? AND year = ? AND month = ?")) {
          const [userId, year, month] = args;
          return { rows: months.filter((item) => item.user_id === userId && item.year === year && item.month === month) };
        }

        if (sql.includes("FROM monthly_expense_months") && sql.includes("ORDER BY year DESC, month DESC")) {
          const [userId, year, repeatedYear, month] = args;
          return {
            rows: months
              .filter((item) => item.user_id === userId && (item.year < year || (item.year === repeatedYear && item.month < month)))
              .sort((a, b) => b.year - a.year || b.month - a.month)
              .slice(0, 1)
          };
        }

        if (sql.includes("INSERT INTO monthly_expense_months")) {
          const [id, userId, year, month, incomeCents, variableLimitCents] = args;
          months.push(monthlyExpenseMonth({
            id: String(id),
            user_id: String(userId),
            year: Number(year),
            month: Number(month),
            income_cents: Number(incomeCents),
            variable_limit_cents: Number(variableLimitCents)
          }));
          return { rows: [] };
        }

        if (sql.includes("FROM monthly_expense_categories")) {
          return { rows: [] };
        }

        if (sql.includes("FROM monthly_expense_payment_methods")) {
          return { rows: [] };
        }

        if (sql.includes("FROM monthly_expense_items") && sql.includes("SELECT")) {
          const [userId, monthId] = args;
          return { rows: items.filter((item) => item.user_id === userId && item.month_id === monthId) };
        }

        if (sql.includes("INSERT INTO monthly_expense_items")) {
          const [
            id,
            userId,
            monthId,
            categoryId,
            paymentMethodId,
            description,
            amountCents,
            totalPurchaseCents,
            installmentNumber,
            installmentTotal,
            expenseType,
            installmentGroupId
          ] = args;
          items.push(monthlyExpenseItem({
            id: String(id),
            user_id: String(userId),
            month_id: String(monthId),
            category_id: String(categoryId),
            payment_method_id: String(paymentMethodId),
            description: String(description),
            amount_cents: Number(amountCents),
            total_purchase_cents: Number(totalPurchaseCents),
            installment_number: Number(installmentNumber),
            installment_total: Number(installmentTotal),
            expense_type: expenseType as MonthlyExpenseItemRow["expense_type"],
            installment_group_id: String(installmentGroupId)
          }));
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }
    }
  };
}

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

describe("monthly expense fixed migration", () => {
  it("copies only simple fixed expenses to the next month when requested", async () => {
    const sourceMonth = monthlyExpenseMonth({ id: "june-2026", year: 2026, month: 6 });
    const simpleFixed = monthlyExpenseItem({
      id: "fixed-1",
      month_id: sourceMonth.id,
      description: "Condomínio",
      amount_cents: 64000,
      total_purchase_cents: 64000,
      installment_group_id: "fixed-group"
    });
    const { db, items } = monthlyExpenseMigrationDb([sourceMonth], [
      simpleFixed,
      monthlyExpenseItem({ id: "variable-1", month_id: sourceMonth.id, expense_type: "VARIAVEL" }),
      monthlyExpenseItem({ id: "reserve-1", month_id: sourceMonth.id, expense_type: "RESERVA" }),
      monthlyExpenseItem({
        id: "fixed-installment-1",
        month_id: sourceMonth.id,
        expense_type: "FIXO",
        installment_number: 1,
        installment_total: 3,
        installment_group_id: "installment-group"
      })
    ]);

    const result = await migrateMonthlyFixedExpensesToNextMonth(db as never, "user-1", sourceMonth.id);
    const copiedItems = items.filter((item) => item.month_id === result.detail.month.id);

    expect(result.copied).toBe(1);
    expect(result.detail.month.year).toBe(2026);
    expect(result.detail.month.month).toBe(7);
    expect(copiedItems).toHaveLength(1);
    expect(copiedItems[0]).toMatchObject({
      category_id: simpleFixed.category_id,
      payment_method_id: simpleFixed.payment_method_id,
      description: simpleFixed.description,
      amount_cents: simpleFixed.amount_cents,
      total_purchase_cents: simpleFixed.total_purchase_cents,
      installment_number: 1,
      installment_total: 1,
      expense_type: "FIXO"
    });
    expect(copiedItems[0].id).not.toBe(simpleFixed.id);
    expect(copiedItems[0].installment_group_id).not.toBe(simpleFixed.installment_group_id);
  });

  it("uses January as the next month when migrating December", async () => {
    const december = monthlyExpenseMonth({ id: "december-2026", year: 2026, month: 12 });
    const { db } = monthlyExpenseMigrationDb([december], [
      monthlyExpenseItem({ month_id: december.id, description: "Internet" })
    ]);

    const result = await migrateMonthlyFixedExpensesToNextMonth(db as never, "user-1", december.id);

    expect(result.copied).toBe(1);
    expect(result.detail.month.year).toBe(2027);
    expect(result.detail.month.month).toBe(1);
    expect(result.detail.items[0].description).toBe("Internet");
  });

  it("does not duplicate fixed expenses already present in the next month", async () => {
    const june = monthlyExpenseMonth({ id: "june-2026", year: 2026, month: 6 });
    const july = monthlyExpenseMonth({ id: "july-2026", year: 2026, month: 7 });
    const sourceItem = monthlyExpenseItem({ id: "source-fixed", month_id: june.id });
    const existingTargetItem = monthlyExpenseItem({
      id: "target-fixed",
      month_id: july.id,
      installment_group_id: "target-group"
    });
    const { db, items } = monthlyExpenseMigrationDb([june, july], [sourceItem, existingTargetItem]);

    const result = await migrateMonthlyFixedExpensesToNextMonth(db as never, "user-1", june.id);

    expect(result.copied).toBe(0);
    expect(items.filter((item) => item.month_id === july.id)).toHaveLength(1);
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
