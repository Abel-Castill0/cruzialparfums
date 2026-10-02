import { ProductMarquee } from "@/components/storefront/home/product-marquee";
import Link from "next/link";
import type { Route } from "next";
import Image from "next/image";
import { Reveal } from "@/components/storefront/home/reveal";
import { VideoStory } from "@/components/storefront/home/video-story";
import type { ImportDepositPercentages } from "@/domains/import/import-deposit-policies";
import type { PublicImportFilters, PublicImportPreviewProduct, PublicImportWholesaleRule } from "@/domains/import/public-import";
import type { PublicImportPageResult } from "@/domains/import/public-import-repository";
import { IMPORT_HOME_VIDEO } from "@/domains/platform/home-video";
import type { BusinessUnitSettings } from "@/domains/platform/settings";
import { ImportConditions, ImportContactCta, ImportFaq, ImportProcess } from "@/components/import/storefront/import-information";
import { ImportClosedNotice } from "./import-closed-notice";
import { ImportHero } from "./import-hero";
import { toImportShowcaseItems } from "./import-showcase";
import styles from "./import-home.module.css";

export type ImportHomePage = PublicImportPageResult | { status: "unavailable" };

export function ImportHomeView({ page, filters, contact, depositPercentages, wholesaleRules }: {
  page: ImportHomePage;
  filters: PublicImportFilters;
  contact: BusinessUnitSettings | null;
  depositPercentages: ImportDepositPercentages;
  wholesaleRules: PublicImportWholesaleRule[];
}) {
  const active = page.status === "active" ? page : null;
  const upcoming = page.status === "upcoming" ? page : null;
  const unfiltered = !filters.query && !filters.category && filters.page === 1;
  const showcase = active && unfiltered ? toImportShowcaseItems(active.products) : [];
  const preview = upcoming && unfiltered ? upcoming.products.slice(0, 8) : [];
  const previewItems = preview.map((product) => ({
    id: product.id, href: "/import/catalogo", image: product.mediaUrl, alt: product.mediaAlt,
    kicker: product.brand ?? "Cruzial Import", title: product.name,
    meta: product.presentations[0] ? `Referencia ${product.presentations[0].currency} ${product.presentations[0].price}` : "Precio por confirmar",
  }));

  return (
    <main className={styles.home}>
      <ImportHero hero={active ? { state: "campaign", campaign: active.campaign } : upcoming ? { state: "upcoming", campaign: upcoming.campaign } : { state: page.status === "closed" ? "closed" : "unavailable" }} contact={contact} />
      {showcase.length >= 3 ? <section className={styles.showcase} aria-labelledby="import-showcase-title"><Reveal><ProductMarquee tone="import" label="Productos del consolidado" items={showcase} heading={<><p className={styles.eyebrow}>En este consolidado</p><h2 id="import-showcase-title">Productos disponibles ahora</h2></>} /></Reveal></section> : null}
      {previewItems.length >= 3 ? <section className={styles.showcase} aria-labelledby="import-preview-showcase-title"><Reveal><ProductMarquee tone="import" label="Productos de referencia del próximo consolidado" items={previewItems} heading={<><p className={styles.eyebrow}>Próximo consolidado · vista previa</p><h2 id="import-preview-showcase-title">Productos en preparación</h2></>} /></Reveal></section> : null}

      {(active || upcoming) ? (
        <section className={styles.catalogDoor} aria-labelledby="import-catalog-door-title">
          <div><p className={styles.eyebrow}>{active ? `Consolidado #${active.campaign.number}` : "Catálogo de referencia"}</p><h2 id="import-catalog-door-title">{active ? "Explora el consolidado" : "Conoce los productos"}</h2><p>{active ? "Revisa presentaciones, precios y disponibilidad en la vista completa del catálogo." : "Consulta la vista previa. Los productos aún no están habilitados para compra."}</p></div>
          <Link href={"/import/catalogo" as Route}>{active ? "Abrir catálogo" : "Ver vista previa"}<span aria-hidden="true">→</span></Link>
        </section>
      ) : <ImportClosedNotice contact={contact} unavailable={page.status === "unavailable"} />}

      <ImportProcess />
      <ImportConditions depositPercentages={depositPercentages} />
      <ImportWholesale rules={wholesaleRules} contact={contact} />
      {IMPORT_HOME_VIDEO ? <VideoStory video={{ ...IMPORT_HOME_VIDEO, cta: active || upcoming ? { label: "Ver el catálogo", href: "/import/catalogo" } : { label: "Ver cómo funciona", href: "/import#como-funciona" } }} tone="import" clickToPlay /> : null}
      <ImportFaq depositPercentages={depositPercentages} />
      <ImportContactCta contact={contact} />
    </main>
  );
}

export function ImportPreviewCatalog({ result, filters }: { result: Extract<PublicImportPageResult, { status: "upcoming" }>; filters: PublicImportFilters }) {
  const opening = result.campaign.opensAt ? new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(new Date(result.campaign.opensAt)) : "por confirmar";
  return <section className={styles.catalog} id="catalogo" aria-labelledby="import-preview-catalog-title">
    <Reveal><div className={styles.catalogHeading}><div><p className={styles.eyebrow}>Consolidado #{result.campaign.number}</p><h2 id="import-preview-catalog-title">Vista previa del catálogo</h2></div><p>Apertura estimada: {opening}. El consolidado permanece cerrado hasta confirmar fecha y precios.</p></div></Reveal>
    <div className={styles.previewNotice} role="status"><strong>Catálogo de referencia · compras deshabilitadas</strong><span>Productos y precios tomados del Sexto Consolidado. Se publicarán para compra cuando se confirmen las condiciones del Octavo Consolidado.</span></div>
    {filters.page === 1 && !filters.category && !filters.query && result.categories.length ? <section className={styles.categories} aria-labelledby="import-preview-categories-title"><div className={styles.catalogHeading}><div><p className={styles.eyebrow}>Explora antes de la apertura</p><h2 id="import-preview-categories-title">Familias del catálogo</h2></div><p>Elige una familia para filtrar los productos de referencia.</p></div><ul className={styles.categoryTiles}>{result.categories.map((category) => <li key={category.slug}><a className={styles.categoryTile} href={`/import/catalogo?categoria=${encodeURIComponent(category.slug)}`}><span className={styles.categoryScrim} aria-hidden="true" /><span className={styles.categoryCopy}><strong>{category.name}</strong><span>{category.productCount} productos · precio por confirmar</span></span></a></li>)}</ul></section> : null}
    <form action="/import/catalogo" method="get" className={styles.searchForm}><label htmlFor="import-search">Buscar por producto o marca</label><div><input id="import-search" type="search" name="q" defaultValue={filters.query} maxLength={120} placeholder="Ejemplo: Armaf" />{filters.category ? <input type="hidden" name="categoria" value={filters.category} /> : null}<button type="submit">Buscar</button></div></form>
    {result.categories.length ? <nav className={styles.categoryFilters} aria-label="Filtrar vista previa"><a href="/import/catalogo">Todos <span>{result.total}</span></a>{result.categories.map((category) => <a key={category.slug} href={`/import/catalogo?categoria=${encodeURIComponent(category.slug)}`}>{category.name} <span>{category.productCount}</span></a>)}</nav> : null}
    <p className={styles.resultCount}>{result.total} productos de referencia</p>
    {result.products.length ? <div className={styles.productGrid}>{result.products.map((product) => <PreviewProductCard key={product.id} product={product} />)}</div> : <div className={styles.emptyCatalog}><h3>No encontramos productos con estos filtros.</h3><p>Prueba otra búsqueda o categoría.</p><a href="/import/catalogo">Limpiar filtros</a></div>}
    {result.totalPages > 1 ? <nav className={styles.pagination} aria-label="Páginas de la vista previa">{filters.page > 1 ? <a href={`/import/catalogo?${new URLSearchParams({ ...(filters.query ? { q: filters.query } : {}), ...(filters.category ? { categoria: filters.category } : {}), page: String(filters.page - 1) })}`}>Anterior</a> : <span aria-disabled="true">Anterior</span>}<p>Página {filters.page} de {result.totalPages}</p>{filters.page < result.totalPages ? <a href={`/import/catalogo?${new URLSearchParams({ ...(filters.query ? { q: filters.query } : {}), ...(filters.category ? { categoria: filters.category } : {}), page: String(filters.page + 1) })}`}>Siguiente</a> : <span aria-disabled="true">Siguiente</span>}</nav> : null}
  </section>;
}

function PreviewProductCard({ product }: { product: PublicImportPreviewProduct }) {
  return <article className={styles.productCard}><div className={styles.productMedia}><Image src={product.mediaUrl} alt={product.mediaAlt} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" /></div><div className={styles.productBody}><div className={styles.productIdentity}>{product.brand ? <p>{product.brand}</p> : null}<h3>{product.name}</h3>{product.categoryName ? <span>{product.categoryName}</span> : null}</div><div className={styles.presentationList}>{product.presentations.map((p) => <div key={p.id} className={styles.presentationRow}><div><strong>{p.label}</strong><span>Referencia</span></div><div className={styles.presentationPrice}><strong>{new Intl.NumberFormat("es-PE", { style: "currency", currency: p.currency }).format(Number(p.price))}</strong><span>Por confirmar</span></div></div>)}</div><p className={styles.previewDisabled}>Próximo consolidado · aún no disponible para compra</p></div></article>;
}

function ImportWholesale({ rules, contact }: { rules: PublicImportWholesaleRule[]; contact: BusinessUnitSettings | null }) {
  const labels = { arabic: "Árabe", designer: "Diseñador", niche: "Nicho" } as const;
  return <section className={styles.wholesale} aria-labelledby="import-wholesale-title"><div><p className={styles.eyebrow}>Compras por volumen</p><h2 id="import-wholesale-title">Mayorista Cruzial Import</h2><p>Solo frascos completos. El mínimo se calcula por tipo comercial y los tipos no se combinan. Las compras mayoristas se coordinan por atención directa; el descuento no se calcula en el carrito de compra regular.</p>{contact ? <a href={`https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Import, quiero consultar las condiciones mayoristas.")}`} target="_blank" rel="noopener noreferrer" className={styles.secondaryAction}>Consultar condiciones mayoristas</a> : null}</div>{rules.length ? <ul>{rules.map((rule) => <li key={rule.commercialType}><strong>{labels[rule.commercialType]}</strong><span>Desde {rule.minQuantity} frascos · S/ {Number(rule.discountAmount).toFixed(2)} menos por frasco</span></li>)}</ul> : <p>Las condiciones mayoristas se confirmarán antes de abrir el consolidado.</p>}</section>;
}
