/**
 * Cruzial Platform V2 — client media reconciliation (staging only)
 *
 * assets/data.js + img/perfumes/*.png
 *   -> supabase/staging/client-media-reconciliation.json
 *
 * This script reads filenames only. It never reads image bytes, uploads media,
 * writes to Supabase, or changes the public storefront.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const legacyCatalogPath = resolve(repositoryRoot, "assets/data.js");
const clientMediaDirectory = resolve(repositoryRoot, "img/perfumes");
const stagingPath = resolve(
  repositoryRoot,
  "supabase/staging/client-media-reconciliation.json",
);

export const RECONCILIATION_STATUSES = Object.freeze([
  "EXACT_MATCH",
  "ALIAS_CONFIRMED",
  "AMBIGUOUS",
  "NO_MATCH",
  "CLIENT_ASSET_MISSING",
]);

const KNOWN_CLIENT_ASSET_MISSING = new Map([
  [
    "sceptre-malachite",
    "No confirmed replacement client photo; do not substitute another asset.",
  ],
]);

function filenameStem(value) {
  const name = basename(String(value).replaceAll("\\", "/")).trim();
  return name.replace(/\.(?:png|webp|jpe?g)$/iu, "");
}

export function normalizeMediaIdentity(value) {
  return filenameStem(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseClientFilename(filename) {
  const stem = filenameStem(filename);
  const copyMatch = stem.match(/\s*\((\d+)\)\s*$/u);
  const copyNumber = copyMatch ? Number(copyMatch[1]) : 1;
  const identityStem = copyMatch ? stem.slice(0, copyMatch.index).trim() : stem;

  return {
    filename,
    normalizedFilename: normalizeMediaIdentity(stem),
    normalizedIdentity: normalizeMediaIdentity(identityStem),
    mediaRole: copyNumber === 1 ? "bottle" : copyNumber === 2 ? "set" : "additional",
    copyNumber,
  };
}

function productIdentityKeys(product) {
  return new Set(
    [product.name, `${product.brand ?? ""} ${product.name}`]
      .map(normalizeMediaIdentity)
      .filter(Boolean),
  );
}

function currentImageReferences(product) {
  return [
    ["bottle", product.imgBottle],
    ["set", product.imgSet],
  ]
    .filter((entry) => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([mediaRole, image]) => ({
      legacyProductId: product.id,
      mediaRole,
      image,
      normalizedFilename: normalizeMediaIdentity(image),
      normalizedIdentity: parseClientFilename(basename(image)).normalizedIdentity,
    }));
}

function pushMapList(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (overlap < 2) return 0;

  const containment = overlap / Math.min(leftTokens.size, rightTokens.size);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = overlap / union;
  return Math.max(containment, jaccard);
}

function fuzzyProductCandidates(parsedFile, products) {
  const matches = [];

  for (const product of products) {
    const score = Math.max(
      ...[...productIdentityKeys(product)].map((identity) =>
        tokenSimilarity(parsedFile.normalizedIdentity, identity),
      ),
    );
    if (score >= 0.65) matches.push({ legacyProductId: product.id, score });
  }

  if (matches.length === 0) return [];
  const bestScore = Math.max(...matches.map((match) => match.score));
  return matches
    .filter((match) => match.score === bestScore)
    .map((match) => match.legacyProductId)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function recordSortKey(record) {
  return [
    record.client_original_filename === null ? "1" : "0",
    record.client_original_filename ?? "",
    record.legacy_product_id ?? "",
    record.status,
  ].join("\u0000");
}

export function sortReconciliationRecords(records) {
  return [...records].sort((left, right) =>
    recordSortKey(left).localeCompare(recordSortKey(right), "en"),
  );
}

export function reconcileClientMedia({ products: inputProducts, clientFilenames }) {
  const products = [...inputProducts]
    .filter((product) => product.type !== "combo")
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const productById = new Map(products.map((product) => [product.id, product]));
  const references = products.flatMap(currentImageReferences);
  const directReferenceMap = new Map();
  const identityReferenceMap = new Map();
  const identityProductMap = new Map();

  for (const reference of references) {
    pushMapList(directReferenceMap, reference.normalizedFilename, reference);
    pushMapList(identityReferenceMap, reference.normalizedIdentity, reference);
  }
  for (const product of products) {
    for (const identity of productIdentityKeys(product)) {
      pushMapList(identityProductMap, identity, product.id);
    }
  }

  const parsedFiles = [...clientFilenames]
    .filter((filename) => extname(filename).toLowerCase() === ".png")
    .map(parseClientFilename)
    .sort((left, right) => left.filename.localeCompare(right.filename, "en"));
  const normalizedFileMap = new Map();
  for (const parsedFile of parsedFiles) {
    pushMapList(normalizedFileMap, parsedFile.normalizedFilename, parsedFile.filename);
  }

  const confirmedFilesByProduct = new Map();
  const records = [];

  for (const parsedFile of parsedFiles) {
    const normalizedDuplicates = normalizedFileMap.get(parsedFile.normalizedFilename) ?? [];
    const directReferences = directReferenceMap.get(parsedFile.normalizedFilename) ?? [];
    const directProductIds = uniqueSorted(
      directReferences.map((reference) => reference.legacyProductId),
    );
    const exactIdentityProductIds = uniqueSorted(
      identityProductMap.get(parsedFile.normalizedIdentity) ?? [],
    );
    const imageIdentityProductIds = uniqueSorted(
      (identityReferenceMap.get(parsedFile.normalizedIdentity) ?? []).map(
        (reference) => reference.legacyProductId,
      ),
    );

    let candidateIds = [];
    let status;
    let matchBasis;
    let notes;
    let matchedReference = null;

    if (normalizedDuplicates.length > 1) {
      candidateIds = uniqueSorted([
        ...directProductIds,
        ...exactIdentityProductIds,
        ...imageIdentityProductIds,
        ...fuzzyProductCandidates(parsedFile, products),
      ]);
      status = "AMBIGUOUS";
      matchBasis = "DUPLICATE_NORMALIZED_FILENAME";
      notes = "Multiple client files normalize to the same filename; no identity was confirmed automatically.";
    } else if (directProductIds.length === 1) {
      candidateIds = directProductIds;
      matchedReference = directReferences.find(
        (reference) => reference.legacyProductId === directProductIds[0],
      );
      if (exactIdentityProductIds.includes(directProductIds[0])) {
        status = "EXACT_MATCH";
        matchBasis = "NORMALIZED_CATALOG_IDENTITY_AND_IMG_MAP";
        notes = "Normalized filename matches the catalog identity and the current legacy image mapping.";
      } else {
        status = "ALIAS_CONFIRMED";
        matchBasis = "CURRENT_IMG_MAP";
        notes = "The current authoritative legacy image mapping confirms this filename-to-product alias.";
      }
    } else if (directProductIds.length > 1) {
      candidateIds = directProductIds;
      status = "AMBIGUOUS";
      matchBasis = "IMG_MAP_COLLISION";
      notes = "The current legacy image mapping points this normalized filename at multiple products.";
    } else {
      candidateIds = uniqueSorted([
        ...exactIdentityProductIds,
        ...imageIdentityProductIds,
      ]);

      if (candidateIds.length === 1 && exactIdentityProductIds.includes(candidateIds[0])) {
        status = "EXACT_MATCH";
        matchBasis = "NORMALIZED_CATALOG_IDENTITY";
        notes = "Normalized filename matches one legacy catalog product identity.";
      } else if (candidateIds.length === 1 && imageIdentityProductIds.includes(candidateIds[0])) {
        status = "ALIAS_CONFIRMED";
        matchBasis = "CURRENT_IMG_MAP_IDENTITY";
        notes = "The current authoritative legacy image mapping confirms this filename-to-product alias.";
      } else if (candidateIds.length > 0) {
        status = "AMBIGUOUS";
        matchBasis = "MULTIPLE_EXACT_CANDIDATES";
        notes = "The normalized filename apparently matches multiple catalog products.";
      } else {
        candidateIds = fuzzyProductCandidates(parsedFile, products);
        status = candidateIds.length > 0 ? "AMBIGUOUS" : "NO_MATCH";
        matchBasis = candidateIds.length > 0 ? "FUZZY_CANDIDATE_ONLY" : "NO_CATALOG_CANDIDATE";
        notes = candidateIds.length > 0
          ? "Filename similarity suggests candidate products, but fuzzy similarity is not authoritative."
          : "No safe legacy catalog identity candidate was found from filename metadata.";
      }
    }

    const confirmed = status === "EXACT_MATCH" || status === "ALIAS_CONFIRMED";
    const legacyProductId = confirmed ? candidateIds[0] : null;
    const product = legacyProductId ? productById.get(legacyProductId) : null;
    if (confirmed && legacyProductId) {
      pushMapList(confirmedFilesByProduct, legacyProductId, parsedFile.filename);
    }

    records.push({
      legacy_product_id: legacyProductId,
      legacy_product_name: product?.name ?? null,
      brand: product?.brand ?? null,
      current_legacy_image: matchedReference?.image ?? null,
      client_original_filename: parsedFile.filename,
      media_role: parsedFile.mediaRole,
      status,
      match_basis: matchBasis,
      notes,
      source: ["assets/data.js", "img/perfumes filename inventory"],
      candidate_legacy_product_ids: confirmed ? [] : candidateIds,
    });
  }

  for (const product of products) {
    if ((confirmedFilesByProduct.get(product.id) ?? []).length > 0) continue;
    const knownMissingNote = KNOWN_CLIENT_ASSET_MISSING.get(product.id);
    const ambiguousCandidates = records.some(
      (record) =>
        record.status === "AMBIGUOUS" &&
        record.candidate_legacy_product_ids.includes(product.id),
    );
    if (ambiguousCandidates && !knownMissingNote) continue;

    records.push({
      legacy_product_id: product.id,
      legacy_product_name: product.name,
      brand: product.brand ?? null,
      current_legacy_image: product.img ?? null,
      client_original_filename: null,
      media_role: null,
      status: knownMissingNote ? "CLIENT_ASSET_MISSING" : "NO_MATCH",
      match_basis: knownMissingNote ? "DOCUMENTED_CLIENT_ASSET_MISSING" : "NO_CLIENT_FILE",
      notes: knownMissingNote ?? "No client PNG filename safely matches this legacy catalog product.",
      source: knownMissingNote
        ? ["assets/data.js", "docs/client-decisions.md"]
        : ["assets/data.js", "img/perfumes filename inventory"],
      candidate_legacy_product_ids: [],
    });
  }

  const sortedRecords = sortReconciliationRecords(records);
  const confirmedGroups = [...confirmedFilesByProduct.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([legacyProductId, filenames]) => ({
      legacy_product_id: legacyProductId,
      client_original_filenames: uniqueSorted(filenames),
      classification: filenames.length === 2 ? "EXPECTED_PAIR" : "REVIEW_ADDITIONAL_FILES",
    }))
    .sort((left, right) => left.legacy_product_id.localeCompare(right.legacy_product_id, "en"));
  const duplicateNormalizedFilenames = [...normalizedFileMap.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([normalizedFilename, filenames]) => ({
      normalized_filename: normalizedFilename,
      client_original_filenames: uniqueSorted(filenames),
    }))
    .sort((left, right) => left.normalized_filename.localeCompare(right.normalized_filename, "en"));
  const filesMatchingMultipleProducts = sortedRecords
    .filter((record) => record.client_original_filename && record.candidate_legacy_product_ids.length > 1)
    .map((record) => ({
      client_original_filename: record.client_original_filename,
      candidate_legacy_product_ids: record.candidate_legacy_product_ids,
    }));
  const imgMapCollisions = [...directReferenceMap.entries()]
    .filter(([, values]) => uniqueSorted(values.map((value) => value.legacyProductId)).length > 1)
    .map(([normalizedFilename, values]) => ({
      normalized_filename: normalizedFilename,
      references: values
        .map(({ legacyProductId, mediaRole, image }) => ({
          legacy_product_id: legacyProductId,
          media_role: mediaRole,
          current_legacy_image: image,
        }))
        .sort((left, right) =>
          `${left.legacy_product_id}:${left.media_role}`.localeCompare(
            `${right.legacy_product_id}:${right.media_role}`,
            "en",
          ),
        ),
    }))
    .sort((left, right) => left.normalized_filename.localeCompare(right.normalized_filename, "en"));

  const countStatus = (status) => sortedRecords.filter((record) => record.status === status).length;
  const orphanClientFiles = sortedRecords
    .filter((record) => record.client_original_filename && record.status === "NO_MATCH")
    .map((record) => record.client_original_filename);

  return {
    records: sortedRecords,
    report: {
      catalog_products: products.length,
      client_png_files: parsedFiles.length,
      exact_matches: countStatus("EXACT_MATCH"),
      alias_confirmed: countStatus("ALIAS_CONFIRMED"),
      ambiguous: countStatus("AMBIGUOUS"),
      no_match: countStatus("NO_MATCH"),
      client_asset_missing: countStatus("CLIENT_ASSET_MISSING"),
      orphan_client_files: orphanClientFiles.length,
    },
    unresolved: {
      ambiguous: sortedRecords.filter((record) => record.status === "AMBIGUOUS"),
      no_match: sortedRecords.filter((record) => record.status === "NO_MATCH"),
      client_asset_missing: sortedRecords.filter(
        (record) => record.status === "CLIENT_ASSET_MISSING",
      ),
      orphan_client_files: orphanClientFiles,
    },
    duplicate_analysis: {
      multiple_client_files_per_product: confirmedGroups,
      files_matching_multiple_products: filesMatchingMultipleProducts,
      duplicate_normalized_filenames: duplicateNormalizedFilenames,
      img_map_collisions: imgMapCollisions,
    },
  };
}

function loadLegacyProducts(source) {
  const legacyWindow = Object.create(null);
  vm.runInNewContext(source, { window: legacyWindow }, {
    filename: "assets/data.js",
    timeout: 1_000,
  });
  if (!Array.isArray(legacyWindow.CRUZIAL_PRODUCTS)) {
    throw new Error("assets/data.js did not expose window.CRUZIAL_PRODUCTS");
  }
  return legacyWindow.CRUZIAL_PRODUCTS;
}

export function serializeReconciliationArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

async function buildArtifact() {
  const legacySource = await readFile(legacyCatalogPath, "utf8");
  const directoryEntries = await readdir(clientMediaDirectory, { withFileTypes: true });
  const clientFilenames = directoryEntries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".png")
    .map((entry) => entry.name);
  const reconciliation = reconcileClientMedia({
    products: loadLegacyProducts(legacySource),
    clientFilenames,
  });
  const inventoryFingerprint = createHash("sha256")
    .update(clientFilenames.sort((left, right) => left.localeCompare(right, "en")).join("\n"))
    .digest("hex");

  return {
    schema_version: 1,
    purpose: "Client PNG filename reconciliation against the legacy Parfums catalog; staging only.",
    scope: {
      catalog: "assets/data.js non-combo products",
      client_media: "img/perfumes/*.png filenames only",
      public_source_of_truth: "LegacyCatalogRepository / assets/data.js",
      migration_blocked_until: "Commercial Data Reconciliation legacy -> Supabase provides stable product IDs",
    },
    source_fingerprints: {
      legacy_catalog_sha256: createHash("sha256").update(legacySource).digest("hex"),
      client_filename_inventory_sha256: inventoryFingerprint,
    },
    ...reconciliation,
  };
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const artifact = await buildArtifact();
  const output = serializeReconciliationArtifact(artifact);

  if (checkOnly) {
    const current = await readFile(stagingPath, "utf8").catch(() => null);
    if (current !== output) {
      throw new Error(
        "Client media reconciliation is stale. Run `npm --prefix apps/web run media:reconcile`.",
      );
    }
    console.log(`Client media reconciliation is current (${artifact.report.client_png_files} PNG files).`);
    return;
  }

  await writeFile(stagingPath, output, "utf8");
  console.log(JSON.stringify(artifact.report, null, 2));
  console.log(`Wrote ${stagingPath}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
