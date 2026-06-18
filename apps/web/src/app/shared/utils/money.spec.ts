import { formatBrl, formatMoneyInput, normalizeDecimalInput, parseMoneyCents } from "./money";

describe("money utils", () => {
  it("normalizes decimal input to Brazilian cents", () => {
    expect(normalizeDecimalInput("R$ 1.234,567")).toBe("1234,56");
    expect(normalizeDecimalInput("12.34")).toBe("12,34");
    expect(normalizeDecimalInput("1234")).toBe("1234");
  });

  it("parses money strings to cents", () => {
    expect(parseMoneyCents("1.234,56")).toBe(123456);
    expect(parseMoneyCents("12,30")).toBe(1230);
    expect(parseMoneyCents("0,00")).toBeNull();
    expect(parseMoneyCents("0,00", { allowZero: true })).toBe(0);
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents("", { allowZero: true })).toBe(0);
  });

  it("formats cents for inputs and display", () => {
    expect(formatMoneyInput(123456)).toBe("1234,56");
    expect(formatBrl(123456)).toContain("1.234,56");
  });
});
