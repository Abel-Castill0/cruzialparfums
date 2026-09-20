import { createHash } from "node:crypto";

export const PRESENTATION_CLASSES = Object.freeze({
  SINGLE: "A_SINGLE_FIXED_PRESENTATION",
  MULTI: "B_MULTI_PRESENTATION",
  PACK: "C_PACK_SET",
  AMBIGUOUS: "D_PRESENTATION_AMBIGUOUS",
});

const EXTERNAL_EVIDENCE = Object.freeze({
  "32:*": {
    brand: "Bharara",
    method: "external_verification",
    url: "https://www.shoppersdepuertorico.com/wp-content/uploads/shopper-emotion-beauty-supply-pqte.pdf",
    note: "External catalog corroborates Bharara Rome Extradose; the PDF page presents the Rome line as one family.",
  },
  "34:8": {
    brand: "Gulf Orchid",
    method: "external_verification",
    url: "https://shop-gulforchid.com/products/mango_ice_eau_de_parfum",
    note: "Official Gulf Orchid product page identifies Mango Ice.",
  },
  "35:1-4": {
    brand: "Emper",
    method: "external_verification",
    url: "https://uk.emperperfumes.com/products/imperial-by-stallion-53",
    note: "Official Emper site identifies Stallion 53 as an Emper collection; source packaging supplies the individual names.",
  },
  "33:1": {
    brand: "Paris Corner",
    method: "external_verification",
    url: "https://www.pariscornerperfumes.com/products/marshmallow-blush",
    note: "Official Paris Corner product page resolves the PDF's misspelled Mashmallow Blush label.",
  },
  "35:5": {
    brand: "Riiffs",
    method: "external_verification",
    url: "https://www.riiffsperfumes.com/product/freeze/",
    note: "Official Riiffs product page identifies Freeze.",
  },
  "35:6": {
    brand: "Fragrance World",
    method: "external_verification",
    url: "https://sa.frenchavenue.com/products/creme-of-clouds",
    note: "Official Fragrance World/French Avenue storefront identifies Crème of Clouds.",
  },
});

const PAGE_BRANDS = Object.freeze({
  3: "Lattafa", 4: "Lattafa", 5: "Lattafa", 6: "Lattafa", 7: "Lattafa", 8: "Lattafa", 9: "Lattafa", 10: "Lattafa",
  11: "Armaf", 12: "Armaf", 13: "Armaf", 14: "Armaf", 15: "Armaf", 16: "Armaf",
  17: "Afnan", 18: "Afnan", 19: "Rasasi", 20: "Rasasi", 21: "Al Haramain",
  22: "French Avenue", 23: "French Avenue", 24: "French Avenue", 25: "Rayhaan",
  27: "Maison Alhambra", 28: "Maison Alhambra", 30: "Jo Milano Paris", 31: "Bharara", 32: "Bharara",
  37: "Jean Paul Gaultier", 38: "Jean Paul Gaultier", 39: "Valentino", 40: "Giorgio Armani",
  41: "Yves Saint Laurent", 45: "Rabanne", 52: "Burberry", 54: "Givenchy", 55: "Dior", 56: "Dior", 57: "Prada",
  59: "Xerjoff", 62: "Parfums de Marly", 63: "Parfums de Marly", 64: "Lorenzo Pazzaglia", 67: "Bond No. 9", 69: "Creed",
});

const BLOCK_RULES = Object.freeze([
  [26, 1, 3, "Rayhaan"], [26, 4, 12, "Dumont Paris"],
  [29, 1, 4, "Maison Alhambra"], [29, 5, 12, "Jo Milano Paris"],
  [33, 1, 6, "Paris Corner"], [33, 7, 12, "King of Kings"],
  [34, 1, 4, "King of Kings"], [34, 5, 7, "Rave"], [34, 8, 8, "Gulf Orchid"], [34, 9, 12, "Le Chameau"],
  [35, 1, 4, "Emper"], [35, 5, 5, "Riiffs"], [35, 6, 6, "Fragrance World"], [35, 7, 7, "Le Chameau"], [35, 8, 9, "Arabiyat Prestige"],
  [40, 11, 12, "Yves Saint Laurent"], [42, 1, 3, "Yves Saint Laurent"], [42, 4, 4, "Nautica"], [42, 5, 12, "Azzaro"],
  [43, 1, 6, "Viktor&Rolf"], [43, 7, 12, "Montblanc"], [44, 1, 4, "Montblanc"], [44, 5, 11, "Ralph Lauren"], [44, 12, 12, "Bvlgari"],
  [46, 1, 8, "Rabanne"], [46, 9, 12, "Dolce & Gabbana"], [47, 1, 4, "Dolce & Gabbana"], [47, 5, 12, "Versace"],
  [48, 1, 12, "Carolina Herrera"], [49, 1, 9, "Carolina Herrera"], [49, 10, 12, "Halloween"],
  [50, 1, 1, "Halloween"], [50, 2, 12, "Ariana Grande"], [51, 1, 7, "Katy Perry"], [51, 8, 9, "Moschino"], [51, 10, 12, "Lacoste"],
  [53, 1, 9, "Hugo Boss"], [53, 10, 12, "Givenchy"], [58, 1, 4, "Chanel"], [58, 5, 12, "Maison Margiela"],
  [60, 1, 4, "Xerjoff"], [60, 5, 12, "Mancera"], [61, 1, 8, "Montale"], [61, 9, 12, "Stéphane Humbert Lucas 777"],
  [65, 1, 8, "Kilian Paris"], [65, 9, 12, "Giardini di Toscana"], [66, 1, 4, "Acqua di Parma"], [66, 5, 8, "Ex Nihilo"], [66, 9, 12, "Maison Crivelli"],
  [68, 1, 8, "Nishane"], [68, 9, 11, "Initio Parfums Privés"], [68, 12, 12, "Sospiro"], [70, 1, 4, "Creed"], [70, 5, 12, "Elivi"],
  [71, 1, 4, "Elivi"], [71, 5, 12, "Tom Ford"], [72, 1, 8, "Tom Ford"], [72, 9, 9, "M. Micallef"],
  [74, 1, 12, "Lattafa"], [75, 1, 9, "Lattafa"], [75, 10, 12, "Armaf"], [76, 1, 1, "Rasasi"], [76, 2, 6, "Jo Milano Paris"], [76, 7, 7, "Bharara"], [76, 8, 8, "Versace"],
]);

const MERGED_DUPLICATES = new Set([
  "sc-p059-b10-0b25df29c5|sc-p060-b04-2474565c43",
  "sc-p034-b10-ef1a751116|sc-p035-b07-d497c672cc",
  "sc-p011-b10-2c8b30d085|sc-p012-b10-37a8f09535",
]);

const CANONICAL_NAME_OVERRIDES = Object.freeze({
  "sc-p039-b06-11966ffabb": "Born in Roma Uomo Extradose",
  "sc-p039-b11-dc0f5cc4ae": "Donna Born in Roma Extradose",
});

export function stableId(prefix, ...parts) {
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

export function normalizeIdentity(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function brandFor(record) {
  const page = record.source.page;
  const block = record.source.block_index;
  const matched = BLOCK_RULES.find(([p, from, to]) => p === page && block >= from && block <= to);
  const brand = matched?.[3] ?? PAGE_BRANDS[page] ?? null;
  if (!brand) return { value: null, status: "external_verification_needed", provenance: { type: "UNKNOWN", method: "unresolved" } };
  const evidence = EXTERNAL_EVIDENCE[`${page}:${block}`]
    ?? EXTERNAL_EVIDENCE[`${page}:*`]
    ?? (page === 35 && block <= 4 ? EXTERNAL_EVIDENCE["35:1-4"] : null);
  return {
    value: brand,
    status: "resolved_high_confidence",
    provenance: evidence
      ? { type: "DERIVED_VALIDATED", method: evidence.method, source_url: evidence.url, note: evidence.note }
      : { type: "OFFICIAL_PDF", method: "visible_packaging_or_repeated_page_family", source_page: page },
  };
}

function canonicalName(record) {
  return CANONICAL_NAME_OVERRIDES[record.record_id] ?? record.product.candidate_name;
}

function duplicateMergeKey(recordId, duplicateGroups) {
  for (const group of duplicateGroups) {
    const signature = [...group.record_ids].sort().join("|");
    if (MERGED_DUPLICATES.has(signature) && group.record_ids.includes(recordId)) return `merged:${[...group.record_ids].sort()[0]}`;
  }
  return null;
}

export function classifyPresentation(record) {
  if (record.classification.offer_kind === "pack" || record.classification.offer_kind === "set") return PRESENTATION_CLASSES.PACK;
  const options = record.campaign_offer.price_options_candidate;
  if (options.length > 1) return PRESENTATION_CLASSES.MULTI;
  if (options.length === 1 && options[0].raw_size) return PRESENTATION_CLASSES.SINGLE;
  return PRESENTATION_CLASSES.AMBIGUOUS;
}

function packEvidence(record) {
  if (classifyPresentation(record) !== PRESENTATION_CLASSES.PACK) return null;
  const text = `${record.product.candidate_name} ${record.source.raw_text}`;
  const countMatch = text.match(/\b(\d+)\s*(?:pcs?|pzs?|x)\b/i);
  const components = [...text.matchAll(/\b(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*ml\b/gi)].map((match) => ({ quantity: Number(match[1]), capacity_ml: Number(match[2]) }));
  const plusContents = record.product.candidate_name.includes("+")
    ? record.product.candidate_name.split("+").map((part) => part.trim()).filter(Boolean)
    : [];
  const rawParts = (record.campaign_offer.pack_contents_raw ?? "").split("|").map((part) => part.trim()).filter(Boolean);
  const rawContents = rawParts.length > 1 ? rawParts.slice(1).map((part) => part.replace(/^o\s+/i, "").trim()) : [];
  return {
    item_count_candidate: components.length ? components.reduce((sum, component) => sum + component.quantity, 0) : countMatch ? Number(countMatch[1]) : null,
    capacities_candidate: [...new Set([...record.campaign_offer.size_candidate, ...components.map((component) => `${component.capacity_ml}ml`)])],
    component_quantities_candidate: components,
    contents_candidate: [...new Set([...plusContents, ...rawContents])],
    provenance: "OFFICIAL_PDF",
    note: "Only text visibly associated with this source offer is represented; no inferred contents.",
  };
}

function designerNiche(record) {
  if (record.source.page >= 37 && record.source.page <= 58) return { value: "designer", status: "resolved_high_confidence", provenance: "OFFICIAL_PDF_PAGE_SEQUENCE" };
  if (record.source.page >= 59 && record.source.page <= 72) return { value: "niche", status: "resolved_high_confidence", provenance: "OFFICIAL_PDF_PAGE_SEQUENCE" };
  return { value: null, status: "not_applicable", provenance: "OFFICIAL_PDF_SECTION" };
}

function offerStatus(record, option) {
  if (record.record_id === "sc-p007-b05-bceb44e1f8") return "source_ambiguous";
  if (!option?.price_amount) return record.campaign_offer.availability_candidate === "unavailable" ? "resolved_high_confidence" : "source_ambiguous";
  return "resolved_high_confidence";
}

export function reconcileConsolidado(staging) {
  const sourceRecords = structuredClone(staging.commercial_records);
  const productsByKey = new Map();
  const canonicalOffers = [];

  for (const record of sourceRecords) {
    const brand = brandFor(record);
    const name = canonicalName(record);
    const mergeKey = duplicateMergeKey(record.record_id, staging.duplicate_reconciliation);
    const key = mergeKey ?? `${record.classification.offer_kind}:${record.record_id}`;
    let product = productsByKey.get(key);
    if (!product) {
      product = {
        canonical_product_id: stableId("scp", key),
        canonical_name: name,
        normalized_name: normalizeIdentity(name),
        brand,
        import_segment: designerNiche(record),
        offer_kind: record.classification.offer_kind,
        presentation_class: classifyPresentation(record),
        source_record_ids: [],
        reconciliation_status: brand.value ? "resolved_high_confidence" : "external_verification_needed",
      };
      productsByKey.set(key, product);
    }
    product.source_record_ids.push(record.record_id);
    const options = record.campaign_offer.price_options_candidate.length ? record.campaign_offer.price_options_candidate : [null];
    options.forEach((option, optionIndex) => canonicalOffers.push({
      canonical_offer_id: stableId("sco", record.record_id, String(optionIndex + 1)),
      canonical_product_id: product.canonical_product_id,
      source_record_id: record.record_id,
      source_page: record.source.page,
      source_block_index: record.source.block_index,
      presentation: option ? { raw_label: option.raw_size, size_ml_candidate: /^\d+(?:\.\d+)?ml$/i.test(option.raw_size ?? "") ? Number(option.raw_size.replace(/ml/i, "")) : null } : null,
      price: option ? { amount: option.price_amount, currency: option.currency, provenance: "OFFICIAL_PDF" } : { amount: null, currency: record.campaign_offer.currency, provenance: "UNKNOWN" },
      availability_candidate: record.campaign_offer.availability_candidate === "unavailable" ? "out_of_stock" : null,
      availability_provenance: record.campaign_offer.availability_candidate === "unavailable" ? "OFFICIAL_PDF" : "UNKNOWN",
      pack_set_evidence: packEvidence(record),
      status: offerStatus(record, option),
      publication_eligible: false,
    }));
  }

  const canonicalProducts = [...productsByKey.values()].sort((a, b) => a.canonical_product_id.localeCompare(b.canonical_product_id));
  canonicalOffers.sort((a, b) => a.canonical_offer_id.localeCompare(b.canonical_offer_id));
  const duplicateReconciliation = staging.duplicate_reconciliation.map((group) => {
    const signature = [...group.record_ids].sort().join("|");
    let resolution = "kept_distinct";
    let rationale = "Conservative identity rules do not prove these source occurrences are the same sellable product.";
    if (MERGED_DUPLICATES.has(signature)) {
      resolution = "canonical_product_merged_source_offers_preserved";
      rationale = "Same normalized product identity and brand; distinct source occurrences and campaign prices remain separate offers.";
    } else if (group.normalized_name === "bir extradose") {
      rationale = "Visible bottles identify Uomo and Donna products; canonical names were disambiguated and kept separate.";
    } else if (group.normalized_name === "set khamrah 3pcs") {
      rationale = "Visible/source text identifies different Khamrah configurations; each remains distinct.";
    } else if (group.normalized_name === "asad zanzibar") {
      rationale = "One occurrence is a single product and the other is a pack/set offer; offer kinds cannot be merged.";
    }
    return { ...group, resolution, rationale };
  });

  const remainingDecisions = canonicalOffers.filter((offer) => offer.status === "source_ambiguous").map((offer) => {
    const record = sourceRecords.find((item) => item.record_id === offer.source_record_id);
    return {
      decision_id: stableId("scd", offer.source_record_id),
      page: record.source.page,
      source_record_id: record.record_id,
      product: record.product.candidate_name,
      known: record.source.raw_text,
      ambiguous: record.record_id === "sc-p007-b05-bceb44e1f8" ? "Printed price digits overlap and cannot be read reliably." : "No clear campaign price is printed.",
      recommendation: record.record_id === "sc-p007-b05-bceb44e1f8" ? "Client confirms the Vanilla Freak campaign price from the original commercial source." : "Keep unpublished; no value should be inferred.",
      impact: "Offer remains in staging and cannot be published until the missing commercial fact is confirmed.",
    };
  });

  const counts = {
    source_occurrences: sourceRecords.length,
    canonical_products: canonicalProducts.length,
    canonical_offers: canonicalOffers.length,
    duplicate_groups_reviewed: duplicateReconciliation.length,
    duplicate_groups_merged: duplicateReconciliation.filter((g) => g.resolution.startsWith("canonical_product_merged")).length,
    brands_resolved: canonicalProducts.filter((p) => p.brand.value).length,
    brands_unresolved: canonicalProducts.filter((p) => !p.brand.value).length,
    designer: canonicalProducts.filter((p) => p.import_segment.value === "designer").length,
    niche: canonicalProducts.filter((p) => p.import_segment.value === "niche").length,
    single_presentation: canonicalProducts.filter((p) => p.presentation_class === PRESENTATION_CLASSES.SINGLE).length,
    multi_presentation: canonicalProducts.filter((p) => p.presentation_class === PRESENTATION_CLASSES.MULTI).length,
    pack_set: canonicalProducts.filter((p) => p.presentation_class === PRESENTATION_CLASSES.PACK).length,
    presentation_ambiguous: canonicalProducts.filter((p) => p.presentation_class === PRESENTATION_CLASSES.AMBIGUOUS).length,
    multi_price_source_records: sourceRecords.filter((r) => r.campaign_offer.price_options_candidate.length > 1).length,
    multi_price_resolved: sourceRecords.filter((r) => r.campaign_offer.price_options_candidate.length > 1 && r.campaign_offer.price_options_candidate.every((o) => o.price_amount && o.raw_size)).length,
    multi_price_unresolved: sourceRecords.filter((r) => r.campaign_offer.price_options_candidate.length > 1 && !r.campaign_offer.price_options_candidate.every((o) => o.price_amount && o.raw_size)).length,
    explicit_out_of_stock: sourceRecords.filter((r) => r.campaign_offer.availability_candidate === "unavailable").length,
    availability_unknown: sourceRecords.filter((r) => r.campaign_offer.availability_candidate == null).length,
    manual_decisions_remaining: remainingDecisions.length,
  };

  return {
    schema_version: "4j3r-reviewed-v1",
    generated_from: { artifact: "supabase/staging/import/sexto-consolidado-staging.json", source_sha256: staging.document.source_sha256 },
    publication_policy: { automatic_publish: false, database_ids_assigned: false, database_write_authorized: false },
    source_records: sourceRecords,
    canonical_products: canonicalProducts,
    canonical_offers: canonicalOffers,
    duplicate_reconciliation: duplicateReconciliation,
    remaining_decisions: remainingDecisions,
    counts,
  };
}
