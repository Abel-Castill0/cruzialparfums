import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImportAddToCartButton } from "@/components/import/cart/import-add-to-cart";
import { Reveal } from "@/components/storefront/home/reveal";
import {
  availabilityLabel,
  buildImportCatalogHref,
  formatCampaignPrice,
  presentationClassLabel,
  type PublicImportCampaign,
  type PublicImportFilters,
  type PublicImportProduct,
} from "@/domains/import/public-import";
import type { PublicImportPageResult } from "@/domains/import/public-import-repository";
import { buildCategoryTiles } from "./import-showcase";
import styles from "./import-home.module.css";

type ActiveResult = Extract<PublicImportPageResult, { status: "active" }>;

function ProductCard({
  product,
  campaign,
  priority = false,
}: {
  product: PublicImportProduct;
  campaign: Pick<PublicImportCampaign, "id" | "number">;
  priority?: boolean;
}) {
  const href = `/import/producto/${product.slug}` as Route;
  const availablePresentations = product.presentations.filter((p) => p.availability === "available");
  const hasAvailable = availablePresentations.length > 0;
  const isSinglePresentation = product.presentations.length === 1;
  const singleAvailable = isSinglePresentation && hasAvailable ? availablePresentations[0] : null;

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
          <h3>
            <Link href={href}>{product.name}</Link>
          </h3>
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
        {singleAvailable ? (
          <ImportAddToCartButton
            line={{
              offerId: singleAvailable.offerId,
              offerUpdatedAt: singleAvailable.offerUpdatedAt,
              label: singleAvailable.label,
              productName: product.name,
              price: singleAvailable.price,
              currency: singleAvailable.currency,
              quantity: 1,
            }}
            campaign={campaign}
          />
        ) : hasAvailable ? (
          <Link href={href} className={styles.choosePresentation}>
            Elegir presentación <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <p className={styles.allOutOfStock}>Agotado</p>
        )}
        <Link href={href} className={styles.productLink}>
          Ver producto <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

/**
 * Catalog entry points + the catalog itself. Without filters the visitor
 * first sees the real categories as doors (each keeps using the existing
 * `?categoria=` filter); once a filter is active the doors collapse into the
 * familiar chip bar so the results stay the focus.
 */
export function ImportCatalog({
  result,
  filters,
}: {
  result: ActiveResult;
  filters: PublicImportFilters;
}) {
  const previousHref = buildImportCatalogHref(filters, { page: Math.max(1, filters.page - 1) });
  const nextHref = buildImportCatalogHref(filters, {
    page: Math.min(result.totalPages, filters.page + 1),
  });
  const invalidPage = filters.page > result.totalPages && result.total > 0;
  const unfiltered = !filters.category && !filters.query && filters.page === 1;
  const tiles = buildCategoryTiles(result.categories, result.products);

  return (
    <section className={styles.catalog} id="catalogo" aria-labelledby="catalog-title">
      <Reveal>
        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.eyebrow}>Consolidado #{result.campaign.number}</p>
            <h2 id="catalog-title">Catálogo del consolidado</h2>
          </div>
          <p>Productos agrupados con todas sus presentaciones públicas.</p>
        </div>
      </Reveal>

      {unfiltered && tiles.length > 1 ? (
        <ul className={styles.categoryTiles} aria-label="Explorar por categoría">
          {tiles.map((tile) => (
            <li key={tile.slug}>
              <Link
                href={`${buildImportCatalogHref(filters, { category: tile.slug, page: 1 })}#catalogo` as Route}
                className={styles.categoryTile}
              >
                {tile.image ? (
                  <Image
                    src={tile.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(max-width: 767px) 64vw, (max-width: 1279px) 30vw, 300px"
                    className={styles.categoryImage}
                  />
                ) : null}
                <span className={styles.categoryScrim} aria-hidden="true" />
                <span className={styles.categoryCopy}>
                  <strong>{tile.name}</strong>
                  <span>
                    {tile.productCount} {tile.productCount === 1 ? "producto" : "productos"}
                  </span>
                </span>
                <span className={styles.categoryArrow} aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <form action="/import#catalogo" method="get" className={styles.searchForm}>
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
          {filters.category ? <input type="hidden" name="categoria" value={filters.category} /> : null}
          <button type="submit">Buscar</button>
        </div>
      </form>

      {!unfiltered ? (
        <nav className={styles.categoryFilters} aria-label="Filtrar por categoría">
          <Link
            href={`${buildImportCatalogHref(filters, { category: "", page: 1 })}#catalogo` as Route}
            aria-current={!filters.category ? "page" : undefined}
          >
            Todos
          </Link>
          {result.categories.map((category) => (
            <Link
              key={category.slug}
              href={`${buildImportCatalogHref(filters, { category: category.slug, page: 1 })}#catalogo` as Route}
              aria-current={filters.category === category.slug ? "page" : undefined}
            >
              {category.name} <span>{category.productCount}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <p className={styles.resultCount} aria-live="polite">
        {result.total === 1 ? "1 producto" : `${result.total} productos`}
        {filters.query ? ` para “${filters.query}”` : ""}
      </p>

      {result.products.length > 0 && !invalidPage ? (
        <div className={styles.productGrid}>
          {result.products.map((product, index) => (
            <ProductCard key={product.id} product={product} campaign={result.campaign} priority={index === 0} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyCatalog}>
          <h3>No encontramos productos con estos filtros.</h3>
          <p>Prueba otra búsqueda o vuelve a ver todo el consolidado.</p>
          <Link href="/import#catalogo">Limpiar filtros</Link>
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Paginación del catálogo">
          {filters.page > 1 ? (
            <Link href={`${previousHref}#catalogo` as Route}>Anterior</Link>
          ) : (
            <span aria-disabled="true">Anterior</span>
          )}
          <p>
            Página {Math.min(filters.page, result.totalPages)} de {result.totalPages}
          </p>
          {filters.page < result.totalPages ? (
            <Link href={`${nextHref}#catalogo` as Route}>Siguiente</Link>
          ) : (
            <span aria-disabled="true">Siguiente</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
