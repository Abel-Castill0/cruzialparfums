import type { CatalogProduct } from "../catalog/types";

export const FINDER_FEELING_LABELS = {
  fresco: "Fresco",
  dulce: "Dulce",
  calido: "Cálido",
  intenso: "Intenso",
  elegante: "Elegante",
  misterioso: "Misterioso",
} as const;

export type FinderFeeling = keyof typeof FINDER_FEELING_LABELS;
export type FinderIntensity = 1 | 2 | 3 | 4;

export const FINDER_INTENSITY_LABELS: Record<FinderIntensity, string> = {
  1: "Sutil",
  2: "Moderado",
  3: "Intenso",
  4: "Muy intenso",
};

type FamilyTrait = {
  feelings: FinderFeeling[];
  baseIntensity: FinderIntensity;
};

export const FINDER_FAMILY_TRAITS: Record<string, FamilyTrait> = {
  Fresco: { feelings: ["fresco"], baseIntensity: 1 },
  Acuático: { feelings: ["fresco"], baseIntensity: 1 },
  Cítrico: { feelings: ["fresco"], baseIntensity: 1 },
  Floral: { feelings: ["elegante"], baseIntensity: 2 },
  Gourmand: { feelings: ["dulce", "calido"], baseIntensity: 2 },
  Ámbar: { feelings: ["calido", "misterioso"], baseIntensity: 3 },
  Amaderado: { feelings: ["calido", "misterioso", "elegante"], baseIntensity: 3 },
  Especiado: { feelings: ["intenso", "misterioso"], baseIntensity: 4 },
};

export type FinderAnswers = {
  forWhom: "mi" | "regalar" | null;
  feelings: FinderFeeling[];
  families: string[];
  intensity: FinderIntensity | null;
  notes: string[];
};

export type FinderReasons = {
  direct: string[];
  editorial: string[];
};

export type FinderResult = {
  product: CatalogProduct;
  score: number;
  reasons: FinderReasons;
};

export const EMPTY_FINDER_ANSWERS: FinderAnswers = {
  forWhom: null,
  feelings: [],
  families: [],
  intensity: null,
  notes: [],
};

const WEIGHTS = { family: 25, notes: 30, feelings: 20, intensity: 15, context: 10 };
export const FINDER_LOW_CONFIDENCE = 55;

export function listFinderProducts(products: readonly CatalogProduct[]) {
  return products.filter((product) =>
    !product.discontinued &&
    product.type !== "combo" &&
    Boolean(product.family || product.notes.length),
  );
}

export function listFinderFamilies(products: readonly CatalogProduct[]) {
  const available = new Set(listFinderProducts(products).map((product) => product.family));
  return Object.keys(FINDER_FAMILY_TRAITS).filter((family) => available.has(family));
}

export function listFinderTopNotes(products: readonly CatalogProduct[], limit = 16) {
  const counts = new Map<string, number>();
  for (const product of listFinderProducts(products)) {
    for (const note of product.notes) counts.set(note, (counts.get(note) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([note]) => note);
}

function productIntensity(product: CatalogProduct): FinderIntensity {
  const base = FINDER_FAMILY_TRAITS[product.family]?.baseIntensity ?? 2;
  const adjusted = base + (product.concentration === "EDT" ? -1 : 0) + (product.concentration === "Parfum" ? 1 : 0);
  return Math.max(1, Math.min(4, adjusted)) as FinderIntensity;
}

export function scoreFinderProduct(product: CatalogProduct, answers: FinderAnswers) {
  let obtained = 0;
  let available = 0;
  const reasons: FinderReasons = { direct: [], editorial: [] };

  if (answers.families.length) {
    available += WEIGHTS.family;
    if (answers.families.includes(product.family)) {
      obtained += WEIGHTS.family;
      reasons.direct.push(`familia ${product.family.toLocaleLowerCase("es")}`);
    }
  }
  if (answers.notes.length) {
    available += WEIGHTS.notes;
    const overlap = product.notes.filter((note) => answers.notes.includes(note));
    if (overlap.length) {
      obtained += (overlap.length / answers.notes.length) * WEIGHTS.notes;
      reasons.direct.push(`notas de ${overlap.slice(0, 2).join(" y ").toLocaleLowerCase("es")}`);
    }
  }
  if (answers.feelings.length) {
    available += WEIGHTS.feelings;
    const traits = FINDER_FAMILY_TRAITS[product.family]?.feelings ?? [];
    const matched = answers.feelings.filter((feeling) => traits.includes(feeling));
    if (matched.length) {
      obtained += (matched.length / answers.feelings.length) * WEIGHTS.feelings;
      reasons.editorial.push(matched.map((feeling) => FINDER_FEELING_LABELS[feeling].toLocaleLowerCase("es")).join(" y "));
    }
  }
  if (answers.intensity) {
    available += WEIGHTS.intensity;
    const difference = Math.abs(productIntensity(product) - answers.intensity);
    obtained += (difference === 0 ? 1 : difference === 1 ? 0.5 : 0) * WEIGHTS.intensity;
    if (difference === 0) reasons.editorial.push(`intensidad ${FINDER_INTENSITY_LABELS[answers.intensity].toLocaleLowerCase("es")}`);
  }
  if (answers.forWhom) {
    available += WEIGHTS.context;
    obtained += (answers.forWhom === "regalar" ? (product.gender === "unisex" ? 1 : 0.7) : 0.8) * WEIGHTS.context;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(available ? (obtained / available) * 100 : 0))),
    reasons,
  };
}

export function findPerfumes(products: readonly CatalogProduct[], answers: FinderAnswers) {
  return listFinderProducts(products)
    .map((product) => ({ product, ...scoreFinderProduct(product, answers) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

export function finderConfidence(results: readonly FinderResult[]) {
  if (!results.length || results[0]!.score < FINDER_LOW_CONFIDENCE) return "weak" as const;
  return results[0]!.score - (results[1]?.score ?? 0) < 8 ? "close" as const : "clear" as const;
}

export function finderScoreLabel(score: number) {
  if (score >= 85) return "Excelente coincidencia";
  if (score >= 70) return "Muy buena coincidencia";
  if (score >= FINDER_LOW_CONFIDENCE) return "Buena coincidencia";
  return "Coincidencia parcial";
}

export function finderWhyText(reasons: FinderReasons) {
  if (!reasons.editorial.length && !reasons.direct.length) {
    return "Una opción equilibrada dentro de lo que nos contaste.";
  }
  const parts: string[] = [];
  if (reasons.editorial.length) parts.push(`buscabas algo ${reasons.editorial.join(" y ")}`);
  if (reasons.direct.length) parts.push(`comparte ${reasons.direct.join(" y ")} con tu selección`);
  return `Coincide porque ${parts.join("; ")}.`;
}
