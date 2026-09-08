/**
 * Cruzial Platform V2 - Phase 4F2B pure planning logic.
 *
 * No filesystem/network I/O here - every function takes plain data in and
 * returns plain data out, so it can be unit tested without a local Cloudinary
 * account or a running Supabase instance. scripts/migrate-client-media.mjs
 * is the thin I/O shell that reads img/perfumes/*.png, calls Cloudinary, and
 * talks to Postgres; it delegates every actual decision to this module.
 *
 * Terminology:
 * - "eligible record": a client-media-reconciliation.json record whose
 *   status is EXACT_MATCH or ALIAS_CONFIRMED - the only statuses this phase
 *   is allowed to migrate (docs: Phase 4F2B, section SOURCE).
 * - "slot": bottle/set are single-slot roles (at most one canonical asset
 *   per product); "additional" is a multi-slot role (any number of
 *   confirmed extra views per product).
 */

const ELIGIBLE_STATUSES = new Set(["EXACT_MATCH", "ALIAS_CONFIRMED"]);
const SINGLE_SLOT_ROLES = ["set", "bottle"];
const MIGRATION_SOURCE = "phase_4f2b_client_media";

/** Strips a path down to its filename without extension, for comparing a
 * client PNG's own name against the basename of the currently-deployed webp
 * it should correspond to under the documented 1:1 png-to-webp pipeline
 * (CLAUDE.md: "pure format/size conversion, zero content change"). */
export function basenameNoExt(pathOrFilename) {
  if (!pathOrFilename) return null;
  const parts = pathOrFilename.split("/").join("|").split("\\").join("|").split("|");
  const withoutDir = parts[parts.length - 1];
  const dot = withoutDir.lastIndexOf(".");
  return dot <= 0 ? withoutDir : withoutDir.slice(0, dot);
}

/** Filters the manifest's flat records array down to EXACT_MATCH and
 * ALIAS_CONFIRMED only. Every other status (AMBIGUOUS, NO_MATCH,
 * CLIENT_ASSET_MISSING) is excluded here - nothing downstream ever sees
 * them, so there is no code path that could accidentally migrate one. */
export function selectEligibleRecords(manifest) {
  const records = manifest && manifest.records ? manifest.records : [];
  return records.filter(function (record) {
    return ELIGIBLE_STATUSES.has(record.status);
  });
}

/** Groups records already scoped to one product by media_role only. The
 * caller (planProductMedia) guarantees single-product scope, so there is no
 * external product-id string that could ever fall out of sync with the
 * records' own legacy_product_id field. */
function groupByRole(recordsForOneProduct) {
  const groups = {};
  for (const record of recordsForOneProduct) {
    const role = record.media_role;
    if (!groups[role]) groups[role] = [];
    groups[role].push(record);
  }
  return groups;
}

/**
 * Resolves a single-slot (bottle/set) group with more than one eligible
 * candidate down to exactly one, using ONLY the group's own
 * current_legacy_image field (the currently-deployed IMG_MAP path -
 * AGENTS.md's own "CURRENT PUBLIC SOURCE OF TRUTH") - never a heuristic
 * invented for this migration. A candidate is selected only when its
 * filename (minus extension) exactly matches the basename (minus extension)
 * of current_legacy_image. If zero or more than one candidate satisfies
 * that, this is a real, unresolvable duplicate: return a conflict instead of
 * guessing.
 */
function resolveSingleSlotGroup(records) {
  if (records.length === 1) {
    return { selected: records[0], excluded: [], conflict: null };
  }

  let targetBasename = null;
  for (const record of records) {
    if (record.current_legacy_image) {
      targetBasename = basenameNoExt(record.current_legacy_image);
      break;
    }
  }

  const matches = targetBasename
    ? records.filter(function (record) {
        return basenameNoExt(record.client_original_filename) === targetBasename;
      })
    : [];

  if (matches.length === 1) {
    const selected = matches[0];
    return {
      selected,
      excluded: records.filter(function (record) {
        return record !== selected;
      }),
      conflict: null,
    };
  }

  return {
    selected: null,
    excluded: [],
    conflict: {
      code: "DUPLICATE_SLOT_UNRESOLVED",
      legacy_product_id: records[0].legacy_product_id,
      media_role: records[0].media_role,
      candidates: records.map(function (record) {
        return record.client_original_filename;
      }),
    },
  };
}

/**
 * Deduplicates a multi-slot ("additional") group by content: two records
 * whose local files hash identically are the same physical photo under two
 * filenames, so only one is kept. checksumOf(record) is injected so this
 * stays pure - the caller supplies pre-computed SHA-256 hashes.
 */
function dedupeMultiSlotGroup(records, checksumOf) {
  const sorted = records.slice().sort(function (a, b) {
    return a.client_original_filename.localeCompare(b.client_original_filename);
  });
  const seenChecksums = {};
  const kept = [];
  const duplicates = [];
  for (const record of sorted) {
    const checksum = checksumOf(record);
    if (checksum && seenChecksums[checksum]) {
      duplicates.push(record);
      continue;
    }
    if (checksum) seenChecksums[checksum] = true;
    kept.push(record);
  }
  return { kept, duplicates };
}

/**
 * Builds the deterministic, portable stable-asset-id suffix used in the
 * Cloudinary public_id: "bottle", "set", or "additional-01", "additional-02",
 * ... for multi-slot roles, ordered by filename (never filesystem
 * enumeration order).
 */
export function stableAssetId(mediaRole, ordinal) {
  if (mediaRole !== "additional") return mediaRole;
  const padded = ordinal < 10 ? "0" + ordinal : String(ordinal);
  return "additional-" + padded;
}

/** cruzial/parfums/catalog/<legacy_id>/<stable-asset-id> - no environment
 * UUID anywhere, so the same id is valid in staging and future production. */
export function computePortablePublicId(legacyProductId, assetId) {
  return "cruzial/parfums/catalog/" + legacyProductId + "/" + assetId;
}

/**
 * Resolves the full migration plan for one product's eligible records.
 * Determines primary (docs: "Do NOT assume bottle = primary" - mirrors
 * assets/data.js's own `p.img = imgs.set || imgs.bottle`: set is primary
 * when present, bottle is primary only when set has no eligible record for
 * this product) and deterministic sort_order (set/bottle first, then
 * additional views sorted by filename).
 *
 * @param {string} legacyProductId
 * @param {Array} recordsForProduct eligible records for this product only
 * @param {(record: object) => string | null} checksumOf
 */
export function planProductMedia(legacyProductId, recordsForProduct, checksumOf) {
  const byRole = groupByRole(recordsForProduct);
  const conflicts = [];
  const excluded = [];
  const resolvedSingleSlot = {};

  for (const role of SINGLE_SLOT_ROLES) {
    const records = byRole[role];
    if (!records) continue;
    const resolved = resolveSingleSlotGroup(records);
    if (resolved.conflict) {
      conflicts.push(resolved.conflict);
      continue;
    }
    resolvedSingleSlot[role] = resolved.selected;
    for (const record of resolved.excluded) {
      excluded.push(Object.assign({}, record, { exclusion_reason: "duplicate_slot_not_selected" }));
    }
  }

  const additionalRecords = byRole.additional || [];
  const additionalResolved = dedupeMultiSlotGroup(additionalRecords, checksumOf);
  for (const record of additionalResolved.duplicates) {
    excluded.push(Object.assign({}, record, { exclusion_reason: "duplicate_content" }));
  }

  const primaryRole = resolvedSingleSlot.set ? "set" : resolvedSingleSlot.bottle ? "bottle" : null;

  const items = [];
  let sortOrder = 0;

  for (const role of ["set", "bottle"]) {
    const record = resolvedSingleSlot[role];
    if (!record) continue;
    items.push({
      record,
      mediaRole: role,
      assetId: stableAssetId(role, null),
      isPrimary: role === primaryRole,
      sortOrder: sortOrder++,
    });
  }

  const sortedAdditional = additionalResolved.kept.slice().sort(function (a, b) {
    return a.client_original_filename.localeCompare(b.client_original_filename);
  });
  sortedAdditional.forEach(function (record, index) {
    items.push({
      record,
      mediaRole: "additional",
      assetId: stableAssetId("additional", index + 1),
      isPrimary: false,
      sortOrder: sortOrder++,
    });
  });

  return { legacyProductId, items, excluded, conflicts };
}

/**
 * Top-level entry point: eligible records in, one plan per product out.
 * checksumOf is injected (see module docstring) so this whole module stays
 * filesystem-free and unit-testable with synthetic fixtures.
 */
export function buildMediaMigrationPlan(manifest, checksumOf) {
  const eligible = selectEligibleRecords(manifest);
  const byProduct = {};
  const order = [];
  for (const record of eligible) {
    const id = record.legacy_product_id;
    if (!byProduct[id]) {
      byProduct[id] = [];
      order.push(id);
    }
    byProduct[id].push(record);
  }

  order.sort();
  const products = order.map(function (legacyProductId) {
    return planProductMedia(legacyProductId, byProduct[legacyProductId], checksumOf);
  });

  return { eligibleCount: eligible.length, products };
}

export { ELIGIBLE_STATUSES, SINGLE_SLOT_ROLES, MIGRATION_SOURCE };
