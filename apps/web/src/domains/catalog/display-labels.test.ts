import { describe, expect, it } from "vitest";
import { displayTag } from "./display-labels";

describe("displayTag", () => {
  it("says Diseñador where the data says Designer, whatever the case", () => {
    expect(displayTag("Designer")).toBe("Diseñador");
    expect(displayTag(" designer ")).toBe("Diseñador");
  });

  it("leaves every other tag alone", () => {
    for (const tag of ["Árabe", "Nicho", "Combo", "", "Designer Collection"]) expect(displayTag(tag)).toBe(tag);
  });
});
