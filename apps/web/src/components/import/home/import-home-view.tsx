import { ProductMarquee } from "@/components/storefront/home/product-marquee";
import { Reveal } from "@/components/storefront/home/reveal";
import { VideoStory } from "@/components/storefront/home/video-story";
import type { ImportDepositPercentages } from "@/domains/import/import-deposit-policies";
import type { PublicImportFilters } from "@/domains/import/public-import";
import type { PublicImportPageResult } from "@/domains/import/public-import-repository";
import { IMPORT_HOME_VIDEO } from "@/domains/platform/home-video";
import type { BusinessUnitSettings } from "@/domains/platform/settings";
import {
  ImportConditions,
  ImportContactCta,
  ImportFaq,
  ImportProcess,
} from "@/components/import/storefront/import-information";
import { ImportCatalog } from "./import-catalog";
import { ImportHero } from "./import-hero";
import { toImportShowcaseItems } from "./import-showcase";
import styles from "./import-home.module.css";

export type ImportHomePage = PublicImportPageResult | { status: "unavailable" };

/**
 * Presentation of the Import home. Data loading stays in the route; this
 * view only needs the resolved campaign state, so every state (closed,
 * unavailable, open, filtered, empty) can be rendered and reviewed without a
 * live database.
 */
export function ImportHomeView({
  page,
  filters,
  contact,
  depositPercentages,
}: {
  page: ImportHomePage;
  filters: PublicImportFilters;
  contact: BusinessUnitSettings | null;
  depositPercentages: ImportDepositPercentages;
}) {
  const active = page.status === "active" ? page : null;
  const unfiltered = !filters.query && !filters.category && filters.page === 1;
  const showcase = active && unfiltered ? toImportShowcaseItems(active.products) : [];

  return (
    <main className={styles.home}>
      <ImportHero
        hero={active ? { state: "campaign", campaign: active.campaign } : { state: page.status === "closed" ? "closed" : "unavailable" }}
        contact={contact}
      />

      {showcase.length >= 3 ? (
        <section className={styles.showcase} aria-labelledby="import-showcase-title">
          <Reveal>
            <ProductMarquee
              tone="import"
              label="Productos del consolidado"
              items={showcase}
              heading={
                <>
                  <p className={styles.eyebrow}>En este consolidado</p>
                  <h2 id="import-showcase-title">Productos disponibles ahora</h2>
                </>
              }
            />
          </Reveal>
        </section>
      ) : null}

      {/* With an open campaign the products come first; the process explains
          itself right after. With no catalog there is nothing to prioritise. */}
      {active ? <ImportCatalog result={active} filters={filters} /> : null}

      <ImportProcess />

      <ImportConditions depositPercentages={depositPercentages} />

      {IMPORT_HOME_VIDEO ? <VideoStory video={IMPORT_HOME_VIDEO} tone="import" /> : null}

      <ImportFaq depositPercentages={depositPercentages} />
      <ImportContactCta contact={contact} />
    </main>
  );
}
