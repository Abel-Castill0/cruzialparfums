import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const sourcePath = resolve(repositoryRoot, "assets/data.js");
const outputPath = resolve(
  repositoryRoot,
  "apps/web/src/fixtures/generated/legacy-catalog.json",
);

const expectedCounts = Object.freeze({
  total: 99,
  active: 96,
  discontinued: 3,
  arab: 69,
  designer: 24,
  niche: 3,
  combo: 3,
  duplicateIds: 0,
  bottlePrices: 23,
  hidden: 1,
});

function countCatalog(products) {
  const seen = new Set();
  let duplicateIds = 0;

  for (const product of products) {
    if (seen.has(product.id)) duplicateIds += 1;
    seen.add(product.id);
  }

  return {
    total: products.length,
    active: products.filter((product) => !product.discontinued).length,
    discontinued: products.filter((product) => product.discontinued).length,
    arab: products.filter((product) => product.type === "arab").length,
    designer: products.filter((product) => product.type === "designer").length,
    niche: products.filter((product) => product.type === "niche").length,
    combo: products.filter((product) => product.type === "combo").length,
    duplicateIds,
    bottlePrices: products.filter((product) => product.bottle).length,
    hidden: products.filter((product) => product.hidden).length,
  };
}

function assertCatalogContract(actualCounts) {
  const drift = Object.entries(expectedCounts).filter(
    ([key, value]) => actualCounts[key] !== value,
  );

  if (drift.length > 0) {
    const details = drift
      .map(
        ([key, expected]) =>
          `${key}: expected ${expected}, received ${actualCounts[key]}`,
      )
      .join("; ");
    throw new Error(`Legacy catalog contract drifted — ${details}`);
  }
}

function normalizeProduct(product) {
  const isCombo = product.type === "combo";

  return {
    ...product,
    legacy_id: product.id,
    source: "assets/data.js",
    verificationStatus: "legacy",
    pricingVerificationStatus: "legacy",
    bottlePricingVerificationStatus: product.bottle ? "legacy" : null,
    comboCompositionVerificationStatus: isCombo
      ? "client_provided_pending_reconfirmation"
      : null,
  };
}

async function buildExport() {
  const source = await readFile(sourcePath, "utf8");
  const legacyWindow = Object.create(null);
  vm.runInNewContext(source, { window: legacyWindow }, {
    filename: "assets/data.js",
    timeout: 1_000,
  });

  const products = structuredClone(legacyWindow.CRUZIAL_PRODUCTS ?? []);
  const counts = countCatalog(products);
  assertCatalogContract(counts);

  return {
    metadata: {
      notice: "AUTO-GENERATED — DO NOT EDIT",
      purpose: "legacy_visual_parity_only",
      futureSeedEligible: false,
      sourcePath: "assets/data.js",
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      verificationStatus: "legacy",
      counts,
    },
    config: structuredClone(legacyWindow.CRUZIAL_CONFIG ?? {}),
    wholesale: structuredClone(legacyWindow.CRUZIAL_WHOLESALE ?? {}),
    comboContents: structuredClone(legacyWindow.CRUZIAL_COMBO_CONTENTS ?? {}),
    giftRules: structuredClone(legacyWindow.CRUZIAL_GIFT_RULES ?? []),
    products: products.map(normalizeProduct),
  };
}

const serialized = `${JSON.stringify(await buildExport(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = await readFile(outputPath, "utf8");
  } catch {
    throw new Error("Generated catalog is missing. Run npm run catalog:export.");
  }

  if (current !== serialized) {
    throw new Error(
      "Generated catalog is stale. Run npm run catalog:export and commit the result.",
    );
  }

  console.log("Legacy catalog fixture is deterministic and current.");
} else {
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Wrote ${outputPath}`);
}
