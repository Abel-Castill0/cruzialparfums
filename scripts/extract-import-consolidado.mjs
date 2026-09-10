#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  EXTRACTOR_VERSION,
  buildDuplicateGroups,
  parseCommercialBlock,
  summarizeStaging,
  validateStaging,
} from "./lib/import-consolidado-parser.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const defaultOutput = resolve(repositoryRoot, "supabase/staging/import/sexto-consolidado-staging.json");
const defaultReviewOutput = resolve(repositoryRoot, "docs/reviews/4j3-sexto-consolidado-review.md");
const helperPath = resolve(scriptDirectory, "lib/pdf-layout-extract.py");

const SECTIONS = Object.freeze([
  { key: "arabic", raw: "Perfumeria Arabe", candidateName: "Perfumeria arabe", slug: "perfumeria-arabe", firstPage: 3, lastPage: 35, evidencePage: 2 },
  { key: "designer_niche", raw: "Perfumeria de diseñador y nicho", candidateName: "Perfumeria de diseñador y nicho", slug: "perfumeria-de-disenador-y-nicho", firstPage: 37, lastPage: 72, evidencePage: 36 },
  { key: "packs_sets_presentations", raw: "Packs, sets y presentaciones de perfumes", candidateName: "Packs, sets y presentaciones de perfumes", slug: "packs-sets-y-presentaciones-de-perfumes", firstPage: 74, lastPage: 76, evidencePage: 73 },
]);

// Native text does not contain the diagonal red ribbons. These 12 cells were
// visually verified against this exact source hash; the hash gate below makes
// it impossible to apply the annotations to a different PDF silently.
const VISUAL_AVAILABILITY_BY_SOURCE = Object.freeze({
  "394874f026f7cdd6600e4ecb6c2456279980a501a700cba6d9182632d76e0493": new Map([
    ["17:5", "AGOTADO"], ["18:4", "AGOTADO"], ["22:8", "AGOTADO"],
    ["27:1", "AGOTADO"], ["38:4", "AGOTADO"], ["44:8", "AGOTADO"],
    ["51:7", "AGOTADO"], ["54:2", "AGOTADO"], ["55:1", "AGOTADO"],
    ["58:3", "AGOTADO"], ["58:4", "AGOTADO"], ["74:1", "AGOTADO"],
  ]),
});

// The source visibly contains these glyphs, but its embedded font maps them
// to U+FFFD in native extraction. The original native form is still retained
// in source.native_raw_name; these exact visual readings are source evidence,
// not web corrections.
const VISUAL_NAMES_BY_SOURCE = Object.freeze({
  "394874f026f7cdd6600e4ecb6c2456279980a501a700cba6d9182632d76e0493": new Map([
    ["24:12", "Sh’Mallow Fluff"],
    ["41:7", "La Nuit L’Homme"],
    ["42:1", "Ladies L’Eau Nue"],
    ["63:6", "Delina La Rosée"],
    ["68:3", "Wulóng Chá"],
    ["70:12", "Ville de Genève"],
  ]),
});

const VISUAL_RAW_TEXT_BY_SOURCE = Object.freeze({
  "394874f026f7cdd6600e4ecb6c2456279980a501a700cba6d9182632d76e0493": new Map([
    ["74:4", "Sublime 3Pcs 2\nS/. 165 * 100ml"],
  ]),
});

function parseArgs(argv) {
  const options = { source: null, output: defaultOutput, reviewOutput: defaultReviewOutput, check: false, python: process.env.PYTHON ?? "python" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (["--source", "--output", "--review-output", "--python"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      index += 1;
      if (arg === "--source") options.source = resolve(value);
      if (arg === "--output") options.output = resolve(value);
      if (arg === "--review-output") options.reviewOutput = resolve(value);
      if (arg === "--python") options.python = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.source) throw new Error("--source <pdf> is required");
  return options;
}

function sectionForPage(page) {
  return SECTIONS.find((section) => page >= section.firstPage && page <= section.lastPage) ?? null;
}

function extractionQuality(page) {
  if (page.native_text_characters === 0) return "none";
  if (page.native_text.includes("�")) return "degraded";
  return "usable";
}

function runNativeExtraction(source, python) {
  const result = spawnSync(python, [helperPath, "--source", source], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Native PDF extraction failed (${result.status}): ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function buildStaging({ layout, sourceFilename, sourceRelativePath, sourceSha256, sourceBytes }) {
  const visualAvailability = VISUAL_AVAILABILITY_BY_SOURCE[sourceSha256] ?? new Map();
  const visualNames = VISUAL_NAMES_BY_SOURCE[sourceSha256] ?? new Map();
  const visualRawTexts = VISUAL_RAW_TEXT_BY_SOURCE[sourceSha256] ?? new Map();
  const commercialRecords = [];
  const pageCoverage = [];

  for (const page of layout.pages) {
    const section = sectionForPage(page.page);
    const detectedCells = section
      ? page.cells.filter((cell) => cell.raw_text.trim().length > 0)
      : [];
    const pageRecords = [];
    if (section) {
      for (const cell of page.cells) {
        const record = parseCommercialBlock({
          page: page.page,
          blockIndex: cell.block_index,
          rawText: cell.raw_text,
          section,
          mediaEvidence: cell.image_objects_overlapping > 0 ? "present" : "unknown",
          visualAvailability: visualAvailability.get(`${page.page}:${cell.block_index}`) ?? null,
          visualName: visualNames.get(`${page.page}:${cell.block_index}`) ?? null,
          visualRawText: visualRawTexts.get(`${page.page}:${cell.block_index}`) ?? null,
        });
        if (record) pageRecords.push(record);
      }
    }
    commercialRecords.push(...pageRecords);
    const hasLow = pageRecords.some((record) => record.review.confidence === "low");
    const quality = extractionQuality(page);
    const lowIssues = [...new Set(
      pageRecords
        .filter((record) => record.review.confidence === "low")
        .flatMap((record) => record.review.issues),
    )];
    if (quality === "degraded") lowIssues.push("source_text_incomplete");
    const pageIssues = [...new Set(lowIssues)].sort((left, right) => left.localeCompare(right, "en"));
    pageCoverage.push({
      page: page.page,
      status: section ? (hasLow ? "needs_manual_review" : "parsed") : "no_catalog_content",
      text_extraction_quality: quality,
      source_blocks_detected: detectedCells.length,
      records_found: pageRecords.length,
      issues: pageIssues,
    });
  }

  commercialRecords.sort((left, right) => left.source.page - right.source.page || left.source.block_index - right.source.block_index);
  const staging = {
    schema_version: "4j3-staging-v1",
    extractor_version: EXTRACTOR_VERSION,
    document: {
      source_filename: sourceFilename,
      source_relative_path: sourceRelativePath,
      source_sha256: sourceSha256,
      source_byte_size: sourceBytes,
      page_count: layout.page_count,
      extraction_methods: ["native_pdf_text_layout", "targeted_visual_review"],
      ocr_used: false,
      facts: {
        campaign_number_raw: "SEXTO",
        campaign_title_raw: "SEXTO CONSOLIDADO",
        headline_raw: "Perfumes a precio de importación desde la unidad",
        sales_context_raw: "Perfumes a precio de importación desde la unidad",
        date_window_raw: null,
        general_promotion_text_raw: null,
        source_contact_metadata: {
          whatsapp_raw: "924 590 921",
          tiktok_raw: "@CruzialPeru",
          contact_metadata_status: "source_only_deprecated_for_current_site",
        },
        evidence_page: 1,
        extraction_method: "targeted_visual_review",
      },
    },
    candidate_categories: SECTIONS.map((section) => ({
      raw_category: section.raw,
      candidate_category: { name: section.candidateName, slug: section.slug },
      evidence_page: section.evidencePage,
      source_page_range: [section.firstPage, section.lastPage],
      status: section.key === "designer_niche" ? "review_required" : "parsed",
      issues: section.key === "designer_niche" ? ["category_ambiguous"] : [],
    })),
    page_coverage: pageCoverage,
    commercial_records: commercialRecords,
    duplicate_reconciliation: buildDuplicateGroups(commercialRecords),
    review_summary: null,
  };
  staging.review_summary = summarizeStaging(staging);
  const errors = validateStaging(staging);
  if (errors.length > 0) throw new Error(`Staging validation failed:\n${errors.join("\n")}`);
  return staging;
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reviewMarkdown(staging) {
  const summary = staging.review_summary;
  const pages = staging.page_coverage.filter((entry) => entry.status === "needs_manual_review").map((entry) => entry.page);
  return `# 4J3 - Sexto Consolidado extraction review\n\n` +
    `Source: \`${staging.document.source_filename}\`\n\nSHA-256: \`${staging.document.source_sha256}\`\n\nExtractor: \`${staging.extractor_version}\`\n\n` +
    `## Aggregate results\n\n` +
    `- Pages: ${summary.total_pages}\n- Coverage: ${JSON.stringify(summary.page_statuses)}\n` +
    `- Commercial records: ${summary.total_commercial_records}\n- Confidence: ${JSON.stringify(summary.confidence)}\n` +
    `- Clear single price: ${summary.records_with_clear_price}\n- Without a clear single price: ${summary.records_without_clear_price}\n` +
    `- Packs/sets: ${summary.packs_sets}\n- Possible duplicate groups: ${summary.possible_duplicate_groups}\n` +
    `- Category candidates: ${summary.category_candidates}\n- Variant-model review candidates: ${summary.variant_model_review_candidates}\n` +
    `- Unavailable (visual AGOTADO evidence): ${summary.unavailable_records}\n- OCR-dependent records: ${summary.ocr_dependent_records}\n` +
    `- Records with media evidence present: ${summary.media_present_records}\n\n` +
    `Issue counts: ${JSON.stringify(summary.issue_counts)}\n\n` +
    `## Manual review\n\nPages classified \`needs_manual_review\`: ${pages.length ? pages.join(", ") : "none"}.\n\n` +
    `Unresolved medium/low record IDs (${summary.unresolved_record_ids.length}):\n\n` +
    summary.unresolved_record_ids.map((id) => `- \`${id}\``).join("\n") +
    `\n\n## Architecture evidence\n\n` +
    `Capacity, multi-capacity, and pack-presentation evidence is retained generically. It is not forced into Parfums \`decant\`/\`bottle\` variants. A reviewed Import variant/presentation decision is required before 4J4.\n\n` +
    `Brands are null and flagged \`brand_missing\` because the native commercial text blocks do not state them reliably; brand text visible only inside product imagery was not bulk-OCRed. Human review must resolve brand candidates before 4J4.\n\n` +
    `PDF imagery is recorded per commercial block, but no image was extracted or uploaded. Product-image mapping remains a later media-review concern.\n\n` +
    `## Safety\n\nNo database writes, Supabase pushes, public-storefront changes, contact-setting changes, or automatic approvals were performed.\n`;
}

async function compareFile(path, expected) {
  try {
    return (await readFile(path, "utf8")) === expected;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceBuffer = await readFile(options.source);
  const sourceStats = await stat(options.source);
  const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
  const layout = runNativeExtraction(options.source, options.python);
  const staging = buildStaging({
    layout,
    sourceFilename: basename(options.source),
    sourceRelativePath: relative(repositoryRoot, options.source).replaceAll("\\", "/"),
    sourceSha256,
    sourceBytes: sourceStats.size,
  });
  const json = canonicalJson(staging);
  const review = reviewMarkdown(staging);

  if (options.check) {
    const jsonMatches = await compareFile(options.output, json);
    const reviewMatches = await compareFile(options.reviewOutput, review);
    if (!jsonMatches || !reviewMatches) throw new Error(`Determinism check failed: json=${jsonMatches} review=${reviewMatches}`);
    console.log(JSON.stringify({ check: "ok", source_sha256: sourceSha256, ...staging.review_summary }));
    return;
  }

  await mkdir(dirname(options.output), { recursive: true });
  await mkdir(dirname(options.reviewOutput), { recursive: true });
  await writeFile(options.output, json, "utf8");
  await writeFile(options.reviewOutput, review, "utf8");
  console.log(JSON.stringify({ wrote: [relative(repositoryRoot, options.output), relative(repositoryRoot, options.reviewOutput)], source_sha256: sourceSha256, ...staging.review_summary }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
