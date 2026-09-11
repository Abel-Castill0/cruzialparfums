import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImportInformation } from "@/components/import/storefront/import-information";
import {
  availabilityLabel,
  buildImportCatalogHref,
  formatCampaignPrice,
  parsePublicImportFilters,
  presentationClassLabel,
  type PublicImportProduct,
} from "@/domains/import/public-import";
import { PublicImportRepository } from "@/domains/import/public-import-repository";
import { IMPORT_SETTINGS } from "@/domains/platform/settings";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Consolidados y catálogo",
  description: "Consulta el consolidado vigente y el catálogo público de Cruzial Import.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function whatsappUrl(message = "Hola Cruzial Import, quiero más información.") {
  return `https://wa.me/${IMPORT_SETTINGS.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function formatClosingDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function ClosedState({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <>
      <section className={styles.closedHero} aria-labelledby="import-closed-title">
        <div className={styles.closedCopy}>
          <p className={styles.eyebrow}>Cruzial Import</p>
          <h1 id="import-closed-title">
            {unavailable
              ? "Catálogo no disponible por ahora."
              : "El próximo consolidado se está preparando."}
          </h1>
          <p>
            {unavailable
              ? "No pudimos consultar el estado del consolidado. Inténtalo nuevamente o contáctanos."
              : "Los productos y precios aparecerán cuando el próximo consolidado abra."}
          </p>
          <a
            href={whatsappUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.primaryAction}
          >
            Consultar por WhatsApp
          </a>
        </div>
        <div className={styles.closedVisual}>
          <Image
            src="/import/catalog-fallback.png"
            alt="Composición gráfica de Cruzial Import"
            fill
            loading="eager"
            sizes="(max-width: 767px) 100vw, 48vw"
          />
        </div>
      </section>
      <ImportInformation />
    </>
  );
}

function ProductCard({
  product,
  priority = false,
}: {
  product: PublicImportProduct;
  priority?: boolean;
}) {
  const href = `/import/producto/${product.slug}` as Route;
  return (
    <article className={styles.productCard}>
      <Link href={href} className={styles.productMedia}>
        <Image
          src={product.mediaUrl}
          alt={product.mediaAlt}
          fill
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
        />
      </Link>
      <div className={styles.productBody}>
        <div className={styles.productIdentity}>
          {product.brand ? <p>{product.brand}</p> : null}
          <h2><Link href={href}>{product.name}</Link></h2>
          {product.categoryName ? <span>{product.categoryName}</span> : null}
        </div>
        <div className={styles.presentationList}>
          {product.presentations.map((presentation) => (
            <div key={presentation.id} className={styles.presentationRow}>
              <div>
                <strong>{presentation.label}</strong>
                <span>{presentationClassLabel(presentation.presentationClass)}</span>
              </div>
              <div className={styles.presentationPrice}>
                <strong>{formatCampaignPrice(presentation.price, presentation.currency)}</strong>
                <span data-availability={presentation.availability}>
                  {availabilityLabel(presentation.availability)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <Link href={href} className={styles.productLink}>
          Ver producto <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default async function ImportHomePage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const filters = parsePublicImportFilters(rawParams);
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return <main className={styles.home}><ClosedState unavailable /></main>;

  const result = await new PublicImportRepository(supabase).readCatalog(filters);
  if (result.status === "closed") return <main className={styles.home}><ClosedState /></main>;
  if (result.status === "error") return <main className={styles.home}><ClosedState unavailable /></main>;

  const previousHref = buildImportCatalogHref(filters, { page: Math.max(1, filters.page - 1) });
  const nextHref = buildImportCatalogHref(filters, {
    page: Math.min(result.totalPages, filters.page + 1),
  });
  const invalidPage = filters.page > result.totalPages && result.total > 0;

  return (
    <main className={styles.home}>
      <section className={styles.campaignHero} aria-labelledby="campaign-title">
        <div className={styles.campaignHeading}>
          <p className={styles.eyebrow}>Consolidado #{result.campaign.number}</p>
          <h1 id="campaign-title">{result.campaign.name}</h1>
          <p>{result.campaign.publicMessage || "Precios exclusivos de este consolidado."}</p>
          <a href="#catalogo" className={styles.primaryAction}>Ver catálogo</a>
        </div>
        <dl className={styles.campaignFacts}>
          <div><dt>Precios</dt><dd>Válidos para este consolidado</dd></div>
          {result.campaign.closesAt ? (
            <div><dt>Cierre</dt><dd>{formatClosingDate(result.campaign.closesAt)}</dd></div>
          ) : null}
          <div><dt>Atención</dt><dd>WhatsApp {IMPORT_SETTINGS.whatsappDisplay}</dd></div>
        </dl>
      </section>

      <section className={styles.catalog} id="catalogo" aria-labelledby="catalog-title">
        <div className={styles.catalogHeading}>
          <h2 id="catalog-title">Catálogo del consolidado</h2>
          <p>Productos agrupados con todas sus presentaciones públicas.</p>
        </div>

        <form action="/import" method="get" className={styles.searchForm}>
          <label htmlFor="import-search">Buscar por producto o marca</label>
          <div>
            <input
              id="import-search"
              type="search"
              name="q"
              defaultValue={filters.query}
              maxLength={120}
              placeholder="Ejemplo: Armaf"
            />
            {filters.category ? (
              <input type="hidden" name="categoria" value={filters.category} />
            ) : null}
            <button type="submit">Buscar</button>
          </div>
        </form>

        <nav className={styles.categoryFilters} aria-label="Filtrar por categoría">
          <Link
            href={buildImportCatalogHref(filters, { category: "", page: 1 }) as Route}
            aria-current={!filters.category ? "page" : undefined}
          >
            Todos
          </Link>
          {result.categories.map((category) => (
            <Link
              key={category.slug}
              href={buildImportCatalogHref(filters, { category: category.slug, page: 1 }) as Route}
              aria-current={filters.category === category.slug ? "page" : undefined}
            >
              {category.name} <span>{category.productCount}</span>
            </Link>
          ))}
        </nav>

        <p className={styles.resultCount} aria-live="polite">
          {result.total === 1 ? "1 producto" : `${result.total} productos`}
          {filters.query ? ` para “${filters.query}”` : ""}
        </p>

        {result.products.length > 0 && !invalidPage ? (
          <div className={styles.productGrid}>
            {result.products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index === 0} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyCatalog}>
            <h3>No encontramos productos con estos filtros.</h3>
            <p>Prueba otra búsqueda o vuelve a ver todo el consolidado.</p>
            <Link href="/import">Limpiar filtros</Link>
          </div>
        )}

        {result.totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Paginación del catálogo">
            {filters.page > 1 ? (
              <Link href={previousHref as Route}>Anterior</Link>
            ) : <span aria-disabled="true">Anterior</span>}
            <p>Página {Math.min(filters.page, result.totalPages)} de {result.totalPages}</p>
            {filters.page < result.totalPages ? (
              <Link href={nextHref as Route}>Siguiente</Link>
            ) : <span aria-disabled="true">Siguiente</span>}
          </nav>
        ) : null}
      </section>

      <ImportInformation />
    </main>
  );
}
