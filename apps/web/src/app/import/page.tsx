import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImportAddToCartButton } from "@/components/import/cart/import-add-to-cart";
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
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { readImportDepositPercentages, type ImportDepositPercentages } from "@/domains/import/import-deposit-policies";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Consolidados y catálogo",
  description: "Consulta el consolidado vigente y el catálogo público de Cruzial Import.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function whatsappUrl(whatsappNumber: string, message = "Hola Cruzial Import, quiero más información.") {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function formatClosingDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function WhatsappIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.36A10 10 0 1 0 12 2Zm0 18.2a8.14 8.14 0 0 1-4.15-1.14l-.3-.18-3 .8.8-2.93-.19-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.24-.12-1.44-.71-1.67-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.36-1.7c-.14-.24 0-.37.11-.49.11-.11.24-.29.36-.43.12-.15.16-.25.24-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.85 2.03c0 1.2.87 2.35 1 2.51.12.16 1.71 2.6 4.14 3.65.58.25 1.03.4 1.38.51a3.32 3.32 0 0 0 1.52.1 2.5 2.5 0 0 0 1.63-1.15c.16-.32.16-.6.11-.66-.05-.06-.2-.12-.44-.24Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 12.5 12.5 3.5M12.5 3.5H5.5M12.5 3.5V10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TRUST_POINTS = [
  {
    label: "Consolidado independiente",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="7" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 11h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    label: "Catálogo por campaña",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 4h11l3 3v13H5V4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M9 10h6M9 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Delivery privado",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 7h11v9H3V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 10h4l3 3v3h-7v-6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="7.5" cy="18" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="17.5" cy="18" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
] as const;

function TrustPoints() {
  return (
    <ul className={styles.trustPoints}>
      {TRUST_POINTS.map((point) => (
        <li key={point.label}>
          <span className={styles.trustIcon} aria-hidden="true">{point.icon}</span>
          <span>{point.label}</span>
        </li>
      ))}
    </ul>
  );
}

function HeroVisual({ priority = false }: { priority?: boolean }) {
  return (
    <div className={styles.heroVisual}>
      <Image
        src="/images/import-home/import-hero-container.webp"
        alt="Contenedor de carga Cruzial Import listo para consolidado"
        fill
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        sizes="(max-width: 767px) 100vw, 48vw"
      />
    </div>
  );
}

function ClosedState({
  contact,
  depositPercentages,
  unavailable = false,
}: {
  contact: { whatsappNumber: string } | null;
  depositPercentages: ImportDepositPercentages;
  unavailable?: boolean;
}) {
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
          {contact ? (
            <a
              href={whatsappUrl(contact.whatsappNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.primaryAction}
            >
              <WhatsappIcon /> Consultar por WhatsApp
            </a>
          ) : (
            <p className={styles.primaryAction} role="status">
              El canal de contacto no está disponible temporalmente.
            </p>
          )}
          <TrustPoints />
        </div>
        <HeroVisual priority />
      </section>
      <ImportInformation contact={contact} depositPercentages={depositPercentages} />
    </>
  );
}

function ProductCard({
  product,
  campaign,
  priority = false,
}: {
  product: PublicImportProduct;
  campaign: { id: string; number: number };
  priority?: boolean;
}) {
  const href = `/import/producto/${product.slug}` as Route;
  const availablePresentations = product.presentations.filter(
    (p) => p.availability === "available",
  );
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

export default async function ImportHomePage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const filters = parsePublicImportFilters(rawParams);
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return <main className={styles.home}><ClosedState contact={null} depositPercentages={{ new: null, returning: null }} unavailable /></main>;

  const [catalogResult, contact, depositPercentages] = await Promise.all([
    new PublicImportRepository(supabase).readCatalog(filters),
    readImportPublicContact(supabase),
    readImportDepositPercentages(supabase),
  ]);

  if (catalogResult.status === "closed") return <main className={styles.home}><ClosedState contact={contact} depositPercentages={depositPercentages} /></main>;
  if (catalogResult.status === "error") return <main className={styles.home}><ClosedState contact={contact} depositPercentages={depositPercentages} unavailable /></main>;

  const result = catalogResult;

  const previousHref = buildImportCatalogHref(filters, { page: Math.max(1, filters.page - 1) });
  const nextHref = buildImportCatalogHref(filters, {
    page: Math.min(result.totalPages, filters.page + 1),
  });
  const invalidPage = filters.page > result.totalPages && result.total > 0;

  return (
    <main className={styles.home}>
      <section className={styles.campaignHero} aria-labelledby="campaign-title">
        <div className={styles.closedCopy}>
          <p className={styles.eyebrow}>Consolidado #{result.campaign.number}</p>
          <h1 id="campaign-title">{result.campaign.name}</h1>
          <p>{result.campaign.publicMessage || "Precios exclusivos de este consolidado."}</p>
          <a href="#catalogo" className={styles.primaryAction}>
            Ver catálogo <ArrowIcon />
          </a>
          <dl className={styles.campaignFacts}>
            <div><dt>Precios</dt><dd>Válidos para este consolidado</dd></div>
            {result.campaign.closesAt ? (
              <div><dt>Cierre</dt><dd>{formatClosingDate(result.campaign.closesAt)}</dd></div>
            ) : null}
            <div><dt>Atención</dt><dd>WhatsApp {contact?.whatsappDisplay ?? "no disponible"}</dd></div>
          </dl>
        </div>
        <HeroVisual priority />
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
              <ProductCard
                key={product.id}
                product={product}
                campaign={result.campaign}
                priority={index === 0}
              />
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

      <ImportInformation contact={contact} depositPercentages={depositPercentages} />
    </main>
  );
}
