import { describe, expect, it } from "vitest";
import { canonicalizeCampaignMoneyText } from "./campaign-money";

describe("canonicalizeCampaignMoneyText", () => {
  it.each([
    ["0.01", "0.01"],
    ["16.00", "16.00"],
    ["16.50", "16.50"],
    ["129.90", "129.90"],
    ["9999999999.99", "9999999999.99"],
    ["129.9", "129.90"],
  ])("keeps the DB text %s exact and emits canonical cents", (input, expected) => {
    expect(canonicalizeCampaignMoneyText(input)).toBe(expected);
  });

  it.each([129.9, "1.234", "-1.00", "01.00", null])(
    "rejects a non-text or malformed authoritative value (%s)",
    (input) => {
      expect(canonicalizeCampaignMoneyText(input)).toBeNull();
    },
  );
});
