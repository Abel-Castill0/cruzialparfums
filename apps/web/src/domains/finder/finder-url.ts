import {
  FINDER_FEELING_LABELS,
  FINDER_INTENSITY_LABELS,
  type FinderAnswers,
  type FinderFeeling,
  type FinderIntensity,
} from "./finder-rules";

/**
 * The recommender hands its answers to the catalog through the URL, so the
 * recommendation is shareable, survives a refresh and is computed by the same
 * rules the questionnaire uses. Only a *completed* questionnaire (who for,
 * at least one feeling, an intensity) is accepted back; anything partial or
 * malformed is ignored rather than turned into a made-up recommendation.
 */
export const FINDER_PARAMS = {
  forWhom: "rw",
  feelings: "rf",
  families: "rm",
  intensity: "ri",
  notes: "rn",
} as const;

const FINDER_PARAM_KEYS: readonly string[] = Object.values(FINDER_PARAMS);
// Catalog filters that survive the hand-off (see CatalogExperience).
const CATALOG_PARAM_KEYS = ["gender", "family", "type", "format", "price", "sort", "search"] as const;

const MAX_TEXT = 40;

type ParamSource = Record<string, string | string[] | undefined> | URLSearchParams;

function read(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readList(source: ParamSource, key: string, limit: number): string[] {
  const raw = read(source, key);
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= MAX_TEXT);
  return [...new Set(values)].slice(0, limit);
}

export function finderAnswersToParams(answers: FinderAnswers): URLSearchParams {
  const params = new URLSearchParams();
  if (answers.forWhom) params.set(FINDER_PARAMS.forWhom, answers.forWhom);
  if (answers.feelings.length) params.set(FINDER_PARAMS.feelings, answers.feelings.join(","));
  if (answers.families.length) params.set(FINDER_PARAMS.families, answers.families.join(","));
  if (answers.intensity) params.set(FINDER_PARAMS.intensity, String(answers.intensity));
  if (answers.notes.length) params.set(FINDER_PARAMS.notes, answers.notes.join(","));
  return params;
}

export function parseFinderAnswers(source: ParamSource): FinderAnswers | null {
  const forWhom = read(source, FINDER_PARAMS.forWhom);
  if (forWhom !== "mi" && forWhom !== "regalar") return null;

  const feelings = readList(source, FINDER_PARAMS.feelings, 2).filter(
    (value): value is FinderFeeling => value in FINDER_FEELING_LABELS,
  );
  if (feelings.length === 0) return null;

  const intensity = Number(read(source, FINDER_PARAMS.intensity));
  if (!(intensity in FINDER_INTENSITY_LABELS)) return null;

  return {
    forWhom,
    feelings,
    families: readList(source, FINDER_PARAMS.families, 8),
    intensity: intensity as FinderIntensity,
    notes: readList(source, FINDER_PARAMS.notes, 4),
  };
}

/** Keeps only known catalog filters from a raw query string. */
export function sanitizeCatalogQuery(raw: string | undefined): URLSearchParams {
  const kept = new URLSearchParams();
  if (!raw) return kept;
  const incoming = new URLSearchParams(raw.slice(0, 600));
  for (const key of CATALOG_PARAM_KEYS) {
    const value = incoming.get(key);
    if (value && value.length <= 80) kept.set(key, value);
  }
  return kept;
}

/** Catalog URL carrying the preserved filters plus the completed answers. */
export function buildRecommendationHref(answers: FinderAnswers, catalogQuery?: string): string {
  const params = sanitizeCatalogQuery(catalogQuery);
  for (const [key, value] of finderAnswersToParams(answers)) params.set(key, value);
  return `/parfums/catalogo?${params.toString()}`;
}

/** Same query without the recommendation, i.e. "clear recommendation". */
export function withoutRecommendation(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of FINDER_PARAM_KEYS) params.delete(key);
  return params.toString();
}

export function recommendationQueryString(source: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const key of FINDER_PARAM_KEYS) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  return params.toString();
}
