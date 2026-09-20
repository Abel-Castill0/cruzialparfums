import { createHash } from "node:crypto";

export const EXTRACTOR_VERSION = "1.0.0";

const PRICE_PREFIX = /^S\s*\/\.?/iu;
const PRICE_PATTERN = /^S\s*\/\.?\s*([0-9]+(?:[.,][0-9]{1,3})?)\s*(?:\*\s*(.+))?$/iu;
const SIZE_PATTERN = /\b(?:[0-9]+\s*x\s*)?[0-9]+\s*ml\b/iu;

function unique(values) {
  return [...new Set(values)];
}

export function canonicalDecimalText(rawAmount) {
  const source = String(rawAmount).trim();
  const normalized = /^\d{1,3}(?:,\d{3})+$/u.test(source)
    ? source.replaceAll(",", "")
    : source.replace(",", ".");
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/u.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function normalizeCandidateText(raw) {
  if (raw === null || raw === undefined) return null;
  const normalized = String(raw).replace(/\s+/gu, " ").trim();
  return normalized || null;
}

export function normalizeIdentity(raw) {
  return normalizeCandidateText(raw)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim() ?? "";
}

function stableHash(value, length = 12) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, length);
}

function recordId(page, blockIndex, rawText) {
  return `sc-p${String(page).padStart(3, "0")}-b${String(blockIndex).padStart(2, "0")}-${stableHash(rawText, 10)}`;
}

function parsePriceLine(line) {
  const match = normalizeCandidateText(line)?.match(PRICE_PATTERN);
  if (!match) return null;
  const amount = canonicalDecimalText(match[1]);
  if (!amount) return null;
  return {
    raw_price: line,
    price_amount: amount,
    currency: "PEN",
    raw_size: normalizeCandidateText(match[2]) ?? null,
  };
}

function offerKind(name, sectionKey) {
  if (sectionKey !== "packs_sets_presentations") return "product";
  if (/\bset\b/iu.test(name)) return "set";
  return "pack";
}

function candidateCategory(section) {
  return {
    raw_category: section.raw,
    candidate_import_category: {
      name: section.candidateName,
      slug: section.slug,
    },
  };
}

export function parseCommercialBlock({
  page,
  blockIndex,
  rawText,
  section,
  mediaEvidence = "unknown",
  visualAvailability = null,
  visualName = null,
  visualRawText = null,
}) {
  const effectiveRawText = visualRawText ?? rawText;
  const lines = String(effectiveRawText)
    .split(/\r?\n/gu)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const nativeRawName = lines.find((line) => !PRICE_PREFIX.test(line)) ?? null;
  const rawName = visualName ?? nativeRawName;
  const priceLines = lines.filter((line) => PRICE_PREFIX.test(line));
  const parsedPrices = priceLines.map(parsePriceLine).filter(Boolean);
  const unparsedPriceLines = priceLines.filter((line) => parsePriceLine(line) === null);
  const nonPriceDetails = lines.filter((line) => line !== rawName && !PRICE_PREFIX.test(line));
  const sizeDetailLines = nonPriceDetails.filter((line) => SIZE_PATTERN.test(line));
  const promotionLines = nonPriceDetails.filter((line) => !SIZE_PATTERN.test(line));
  const kind = offerKind(rawName ?? "", section.key);
  const issues = [];

  if (!rawName) issues.push("ambiguous_name");
  issues.push("brand_missing");
  if (visualAvailability === null) issues.push("availability_unknown");
  if (priceLines.length === 0) issues.push("price_missing");
  if (unparsedPriceLines.length > 0) issues.push("price_ambiguous");
  if (String(rawText).includes("�")) issues.push("source_text_incomplete");
  if (visualRawText) issues.push("layout_association_ambiguous");
  if (parsedPrices.length > 1) issues.push("multiple_prices");
  if (section.key === "designer_niche") issues.push("category_ambiguous");
  if (kind !== "product") issues.push("pack_composition_ambiguous");

  const rawOptions = unique(
    [...parsedPrices.map((price) => price.raw_size), ...sizeDetailLines].filter(Boolean),
  );
  const requiresVariantReview =
    rawOptions.length > 0 || parsedPrices.length > 1 || kind !== "product";
  if (requiresVariantReview) issues.push("variant_model_unknown");

  let confidence = "high";
  if (!rawName || unparsedPriceLines.length > 0) confidence = "low";
  else if (priceLines.length === 0 || parsedPrices.length > 1 || kind !== "product") {
    confidence = "medium";
  }

  const status =
    !rawName || unparsedPriceLines.length > 0
      ? "source_incomplete"
      : confidence === "high"
        ? "parsed"
        : "review_required";
  const singlePrice = parsedPrices.length === 1 && unparsedPriceLines.length === 0;
  const packContentsRaw =
    kind === "product" ? null : normalizeCandidateText([rawName, ...nonPriceDetails].filter(Boolean).join(" | "));

  return {
    record_id: recordId(page, blockIndex, rawText),
    source: {
      page,
      section: section.raw,
      block_index: blockIndex,
      raw_text: effectiveRawText,
      native_raw_text: visualRawText ? rawText : null,
      extraction_method: visualAvailability || visualName || visualRawText
        ? "native_pdf_text_layout+targeted_visual_review"
        : "native_pdf_text_layout",
      native_raw_name: visualName ? nativeRawName : null,
    },
    product: {
      raw_name: rawName,
      candidate_name: normalizeCandidateText(rawName),
      raw_brand: null,
      candidate_brand: null,
    },
    campaign_offer: {
      raw_price: priceLines.length > 0 ? priceLines.join(" | ") : null,
      price_amount: singlePrice ? parsedPrices[0].price_amount : null,
      currency: parsedPrices.length > 0 ? "PEN" : null,
      price_options_candidate: parsedPrices,
      raw_availability: visualAvailability,
      availability_candidate: visualAvailability === "AGOTADO" ? "unavailable" : null,
      raw_size: rawOptions.length > 0 ? rawOptions.join(" | ") : null,
      size_candidate: rawOptions,
      promotion_text: kind === "product" ? normalizeCandidateText(promotionLines.join(" | ")) : null,
      pack_contents_raw: packContentsRaw,
    },
    classification: {
      ...candidateCategory(section),
      offer_kind: kind,
    },
    variant_evidence: {
      raw_options: rawOptions,
      option_axes_candidate: rawOptions.length > 0 ? [kind === "product" ? "capacity" : "pack_presentation"] : [],
      requires_variant_model_review: requiresVariantReview,
    },
    media: {
      media_evidence: mediaEvidence,
      candidate_image_reference: null,
      requires_media_review: mediaEvidence !== "absent",
    },
    review: {
      confidence,
      status,
      issues: unique(issues).sort((left, right) => left.localeCompare(right, "en")),
    },
  };
}

function recordSort(left, right) {
  return left.source.page - right.source.page || left.source.block_index - right.source.block_index;
}

export function buildDuplicateGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const identity = normalizeIdentity(record.product.candidate_name);
    if (!identity) continue;
    const values = groups.get(identity) ?? [];
    values.push(record.record_id);
    groups.set(identity, values);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([identity, ids]) => ({
      possible_duplicate_group: `dup-${stableHash(identity)}`,
      normalized_name: identity,
      record_ids: ids,
      match_basis: "exact_normalized_candidate_name",
      disposition: "human_review_required_no_merge",
    }))
    .sort((left, right) => left.possible_duplicate_group.localeCompare(right.possible_duplicate_group, "en"));
}

function countBy(records, selector) {
  const counts = {};
  for (const record of records) {
    const key = selector(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function validateStaging(staging) {
  const errors = [];
  const records = staging.commercial_records;
  const coverage = staging.page_coverage;
  if (coverage.length !== staging.document.page_count) errors.push("page_coverage_count_mismatch");
  const coveredPages = new Set(coverage.map((entry) => entry.page));
  if (coveredPages.size !== staging.document.page_count) errors.push("page_coverage_not_unique");
  for (let page = 1; page <= staging.document.page_count; page += 1) {
    if (!coveredPages.has(page)) errors.push(`page_not_accounted_for:${page}`);
  }
  const allowedCoverageStatuses = new Set(["parsed", "no_catalog_content", "needs_manual_review"]);
  for (const entry of coverage) {
    if (!allowedCoverageStatuses.has(entry.status)) errors.push(`invalid_page_status:${entry.page}`);
    if (entry.source_blocks_detected !== entry.records_found) errors.push(`source_block_dropped:${entry.page}`);
  }
  const ids = new Set();
  let priorKey = "";
  for (const record of records) {
    if (!record.source.page) errors.push(`missing_page:${record.record_id}`);
    if (!record.source.raw_text) errors.push(`missing_raw_text:${record.record_id}`);
    if (ids.has(record.record_id)) errors.push(`duplicate_record_id:${record.record_id}`);
    ids.add(record.record_id);
    const key = `${String(record.source.page).padStart(3, "0")}:${String(record.source.block_index).padStart(2, "0")}`;
    if (priorKey && key < priorKey) errors.push(`unstable_order:${record.record_id}`);
    priorKey = key;
    const price = record.campaign_offer.price_amount;
    if (price !== null && (typeof price !== "string" || !/^[0-9]+\.[0-9]{2}$/u.test(price))) {
      errors.push(`invalid_canonical_price:${record.record_id}`);
    }
    if (["medium", "low"].includes(record.review.confidence) && record.review.issues.length === 0) {
      errors.push(`missing_review_issue:${record.record_id}`);
    }
    if (["approved_for_import", "approved", "published"].includes(record.review.status)) {
      errors.push(`forbidden_review_status:${record.record_id}`);
    }
  }
  const coverageRecordCount = coverage.reduce((sum, entry) => sum + entry.records_found, 0);
  if (coverageRecordCount !== records.length) errors.push("coverage_record_count_mismatch");
  return errors;
}

export function summarizeStaging(staging) {
  const records = staging.commercial_records;
  const issues = records.flatMap((record) => record.review.issues);
  return {
    total_pages: staging.document.page_count,
    page_statuses: countBy(staging.page_coverage, (entry) => entry.status),
    total_commercial_records: records.length,
    confidence: countBy(records, (record) => record.review.confidence),
    records_with_clear_price: records.filter((record) => record.campaign_offer.price_amount !== null).length,
    records_without_clear_price: records.filter((record) => record.campaign_offer.price_amount === null).length,
    packs_sets: records.filter((record) => record.classification.offer_kind !== "product").length,
    possible_duplicate_groups: staging.duplicate_reconciliation.length,
    category_candidates: staging.candidate_categories.length,
    variant_model_review_candidates: records.filter((record) => record.variant_evidence.requires_variant_model_review).length,
    ocr_dependent_records: records.filter((record) => record.source.extraction_method.includes("ocr")).length,
    unavailable_records: records.filter((record) => record.campaign_offer.availability_candidate === "unavailable").length,
    media_present_records: records.filter((record) => record.media.media_evidence === "present").length,
    issue_counts: countBy(issues, (issue) => issue),
    unresolved_record_ids: records
      .filter((record) => record.review.confidence !== "high")
      .map((record) => record.record_id),
  };
}
