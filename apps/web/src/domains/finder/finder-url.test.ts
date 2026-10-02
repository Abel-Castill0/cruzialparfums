import { describe, expect, it } from "vitest";
import { EMPTY_FINDER_ANSWERS, type FinderAnswers } from "./finder-rules";
import {
  buildRecommendationHref,
  finderAnswersToParams,
  parseFinderAnswers,
  sanitizeCatalogQuery,
  withoutRecommendation,
} from "./finder-url";

const complete: FinderAnswers = {
  forWhom: "mi",
  feelings: ["fresco", "elegante"],
  families: ["Floral"],
  intensity: 2,
  notes: ["Vainilla"],
};

describe("finder url hand-off", () => {
  it("round-trips a completed questionnaire", () => {
    expect(parseFinderAnswers(finderAnswersToParams(complete))).toEqual(complete);
  });

  it("never accepts a partial questionnaire as a recommendation", () => {
    expect(parseFinderAnswers(new URLSearchParams())).toBeNull();
    expect(parseFinderAnswers(finderAnswersToParams(EMPTY_FINDER_ANSWERS))).toBeNull();
    expect(parseFinderAnswers(finderAnswersToParams({ ...complete, intensity: null }))).toBeNull();
    expect(parseFinderAnswers(finderAnswersToParams({ ...complete, feelings: [] }))).toBeNull();
    expect(parseFinderAnswers(finderAnswersToParams({ ...complete, forWhom: null }))).toBeNull();
  });

  it("drops unknown feelings, bad intensity and oversized values instead of trusting them", () => {
    expect(parseFinderAnswers(new URLSearchParams("rw=mi&rf=hack&ri=2"))).toBeNull();
    expect(parseFinderAnswers(new URLSearchParams("rw=mi&rf=fresco&ri=9"))).toBeNull();
    const parsed = parseFinderAnswers(new URLSearchParams(`rw=mi&rf=fresco&ri=1&rn=${"x".repeat(80)},Rosa`));
    expect(parsed?.notes).toEqual(["Rosa"]);
  });

  it("reads Next-style searchParams objects too", () => {
    const parsed = parseFinderAnswers({ rw: "regalar", rf: "dulce", ri: "3" });
    expect(parsed).toMatchObject({ forWhom: "regalar", feelings: ["dulce"], intensity: 3 });
  });

  it("preserves only known catalog filters when handing off to the catalog", () => {
    expect(sanitizeCatalogQuery("type=arab&evil=1&search=oud").toString()).toBe("type=arab&search=oud");
    const href = buildRecommendationHref(complete, "type=arab&evil=1");
    expect(href.startsWith("/parfums/catalogo?type=arab&")).toBe(true);
    expect(href).not.toContain("evil");
    expect(href).toContain("rw=mi");
  });

  it("clears the recommendation but keeps the filters", () => {
    expect(withoutRecommendation("type=arab&rw=mi&rf=fresco&ri=2")).toBe("type=arab");
  });
});
