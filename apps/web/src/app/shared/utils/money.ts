const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function normalizeDecimalInput(value: string | number, decimalPlaces = 2): string {
  const rawValue = String(value).replace(/[^\d,.]/g, "");
  const separatorIndex = Math.max(rawValue.lastIndexOf(","), rawValue.lastIndexOf("."));

  if (separatorIndex === -1) {
    return rawValue;
  }

  const whole = rawValue.slice(0, separatorIndex).replace(/[,.]/g, "");
  const decimal = rawValue.slice(separatorIndex + 1).replace(/[,.]/g, "").slice(0, decimalPlaces);
  return `${whole},${decimal}`;
}

export function parseMoneyCents(value: string, options: { allowZero?: boolean } = {}): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();

  if (!normalized && options.allowZero) {
    return 0;
  }

  const parsed = Number(normalized);
  const minimum = options.allowZero ? 0 : Number.MIN_VALUE;

  if (!Number.isFinite(parsed) || parsed < minimum) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function formatMoneyInput(amountCents: number): string {
  return (amountCents / 100).toFixed(2).replace(".", ",");
}

export function formatBrl(amountCents: number): string {
  return brlFormatter.format(amountCents / 100);
}
