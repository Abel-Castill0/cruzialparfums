import type { CSSProperties } from "react";
import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ComboCarousel } from "@/components/parfums/home/combo-carousel";
import { resolveComboMemberPhotos } from "@/domains/combos/combo-builder";
import { FinderDiscovery } from "@/components/parfums/home/finder-discovery";
import { HeroArtwork } from "@/components/parfums/home/hero-carousel";
import {
  countFragrancesByType,
  selectShowcaseProducts,
  toShowcaseItem,
} from "@/components/parfums/home/showcase";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { ProductMarquee } from "@/components/storefront/home/product-marquee";
import { Reveal } from "@/components/storefront/home/reveal";
import { TikTokProfile } from "@/components/storefront/home/tiktok-profile";
import { VideoStory } from "@/components/storefront/home/video-story";
import { PARFUMS_HOME_VIDEO } from "@/domains/platform/home-video";
import { PARFUMS_ATOMIZATIONS } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cruzial Parfums",
  description: "Decants, frascos y combos de perfumería árabe, designer y de nicho en Perú.",
};

// A single established brand banner keeps the Parfums hero focused. The sets'
// own photographs appear in their dedicated section further down the page.
const assurances = [
  { title: "100% originales", text: "Frascos auténticos de casas oficiales", icon: <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8 7.5 9.5 4.4-1.5 7.5-5.1 7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 10" /> },
  { title: "Decants desde 3 ml", text: "También en 5 y 10 ml", icon: <path d="M9.5 3h5v3l1.4 2.8V19a2 2 0 0 1-2 2h-3.8a2 2 0 0 1-2-2V8.8L9.5 6V3Zm-1.5 10h8" /> },
  { title: "Envío por Shalom", text: "A todo el Perú", icon: <path d="M3 6.5h11v9H3zM14 10h4l3 3v2.5h-7M7 17.5a1.8 1.8 0 1 0 0 .01M17 17.5a1.8 1.8 0 1 0 0 .01" /> },
  { title: "Atención por WhatsApp", text: "Stock y total final contigo", icon: <path d="M12 4a8 8 0 0 0-6.9 12l-1 3.5 3.6-1A8 8 0 1 0 12 4Z" /> },
] as const;

const heroArtwork = {
  src: "/parfums/hero/hero-crop.webp",
  alt: "Composición de Cruzial Parfums con frascos de diseñador y el nombre de la marca",
  position: "50% 50%",
  mobilePosition: "50% 50%",
  mobileFit: "wordmark" as const,
};

// Each tile enters the catalog through the filter architecture it already
// has (`?type=`), so the URL stays shareable and the catalog opens filtered.
const discoveryCategories = [
  {
    type: "arab",
    label: "Árabes",
    note: "Lattafa, Afnan, Rasasi y más.",
    image: "/images/parfums-home/parfums-arabe.webp",
    focus: "76% 50%",
  },
  {
    type: "designer",
    label: "Designer",
    note: "Casas reconocidas internacionalmente.",
    image: "/images/parfums-home/parfums-designer.webp",
    focus: "70% 50%",
  },
  {
    type: "niche",
    label: "Nicho",
    note: "Selección de autor.",
    image: "/images/parfums-home/parfums-nicho.webp",
    focus: "68% 50%",
  },
] as const;

const principios = [
  {
    num: "01",
    title: "Originalidad absoluta",
    text: "Solo trabajamos con frascos auténticos de las casas oficiales. Cada decant se prepara a partir de ese frasco original.",
  },
  {
    num: "02",
    title: "Selección curada",
    text: "No vendemos ruido: menos volumen, más carácter en cada fragancia del catálogo.",
  },
  {
    num: "03",
    title: "Atención humana",
    text: "Tu pedido termina en una conversación real por WhatsApp: asesoramos, confirmamos stock y coordinamos la entrega.",
  },
];

const decantSizes = [
  {
    size: "3",
    text: "Para conocer una fragancia sin comprometerte con el frasco completo.",
  },
  {
    size: "5",
    text: "El punto medio: suficiente para llevarlo contigo varias semanas.",
  },
  {
    size: "10",
    text: "Rendimiento de meses. Para cuando ya sabes que es tu fragancia.",
  },
] as const;

// Same source as /parfums/nosotros#faq — this is a condensed teaser, not a
// duplicate copy fork. The full FAQ lives on Nosotros.
const homeFaqs = [
  {
    q: "¿Qué es un decant?",
    a: "Es la misma fragancia original, trasvasada desde el frasco auténtico a envases de 3, 5 y 10 ml.",
  },
  {
    q: "¿Son perfumes originales o réplicas?",
    a: "100% originales. Trabajamos con frascos auténticos de las casas oficiales.",
  },
  {
    q: "¿Cómo hago mi pedido?",
    a: "Añade tus fragancias al carrito, completa tus datos y envía tu pedido por WhatsApp. Un asesor confirma stock, envío y forma de pago contigo antes de cerrar la venta.",
  },
];

export default async function ParfumsHomePage() {
  const { catalog, source } = await loadParfumsStorefront();
  const combos = catalog.listCombos();
  const fragrances = catalog.listFragrances();
  const comboPhotos = Object.fromEntries(
    combos.map((combo) => [combo.slug, resolveComboMemberPhotos(combo.comboContent?.perfumes ?? [], fragrances)]),
  );
  const showcase = selectShowcaseProducts(catalog.listFeatured(), fragrances).map(toShowcaseItem);
  const typeCounts = countFragrancesByType(fragrances);

  return (
    <main className={styles.home}>
      <h1 className={styles.srOnly}>Perfumería de descubrimiento.</h1>

      <HeroArtwork {...heroArtwork} ctaHref="/parfums/catalogo" ctaLabel="Explorar catálogo" />

      <ul className={styles.assurance} aria-label="Lo esencial">
        {assurances.map((item) => (
          <li key={item.title}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
            <span><strong>{item.title}</strong>{item.text}</span>
          </li>
        ))}
      </ul>

      {source === "unavailable" ? <CatalogUnavailableNotice /> : null}

      {showcase.length >= 3 ? (
        <section className={styles.showcase} aria-labelledby="showcase-title">
          <Reveal>
            <ProductMarquee
              tone="parfums"
              label="Fragancias del catálogo"
              items={showcase}
              heading={
                <>
                  <h2 id="showcase-title">
                    Fragancias para <em>descubrir</em>.
                  </h2>
                </>
              }
            />
          </Reveal>
        </section>
      ) : null}

      <section className={styles.discovery} aria-labelledby="discovery-title">
        <Reveal>
          <div className={styles.sectionHead}>
            <div>
              <h2 id="discovery-title">
                Encuentra tu <em>familia</em>.
              </h2>
            </div>
            <Link href="/parfums/catalogo">
              Ver todo el catálogo <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
        <ul className={styles.tiles}>
          {discoveryCategories.map((category, index) => {
            const count = typeCounts[category.type];
            return (
              <li key={category.type} className={styles.tileItem}>
                <Reveal delay={index * 90}>
                  <Link
                    href={`/parfums/catalogo?type=${category.type}` as Route}
                    className={styles.tile}
                    style={{ "--focus": category.focus } as CSSProperties}
                  >
                    <Image
                      src={category.image}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 76vw, 33vw"
                      className={styles.tileImage}
                      loading="lazy"
                    />
                    <span className={styles.tileScrim} aria-hidden="true" />
                    <span className={styles.tileCopy}>
                      {count > 0 ? (
                        <span className={styles.tileCount}>
                          {count} {count === 1 ? "fragancia" : "fragancias"}
                        </span>
                      ) : null}
                      <strong className={styles.tileLabel}>{category.label}</strong>
                      <span className={styles.tileNote}>{category.note}</span>
                    </span>
                    <span className={styles.tileArrow} aria-hidden="true">→</span>
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </section>

      <FinderDiscovery fragrances={fragrances} />

      <section className={styles.craft} aria-labelledby="craft-title">
        <div className={styles.craftGrid}>
          <Reveal className={styles.craftBody}>
            <h2 id="craft-title">
              Del frasco original <em>a tu piel</em>.
            </h2>
            <ol className={styles.principles}>
              {principios.map((principio) => (
                <li key={principio.num}>
                  <div>
                    <h3>{principio.title}</h3>
                    <p>{principio.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/parfums/nosotros" className={styles.textLink}>
              Conoce Cruzial <span aria-hidden="true">→</span>
            </Link>
          </Reveal>
          <Reveal className={styles.craftMediaWrap} delay={120}>
            <figure className={styles.mosaic}>
              <div className={`${styles.mosaicCell} ${styles.mosaicMain}`}>
                <Image
                  src="/images/parfums-home/decants-real-orders.jpg"
                  alt="Decants reales preparados para pedidos de Cruzial Parfums, junto a los frascos originales"
                  fill
                  sizes="(max-width: 899px) 100vw, 46vw"
                  className={styles.mosaicImage}
                  style={{ objectPosition: "50% 55%" }}
                  loading="lazy"
                />
              </div>
              <div className={styles.mosaicCell}>
                <Image
                  src="/images/parfums-home/parfums-authenticity.webp"
                  alt="Frasco Cruzial Parfums, negro y dorado"
                  fill
                  sizes="(max-width: 899px) 50vw, 23vw"
                  className={styles.mosaicImage}
                  style={{ objectPosition: "50% 50%" }}
                  loading="lazy"
                />
              </div>
              <div className={styles.mosaicCell}>
                <Image
                  src="/images/parfums-home/parfums-decant-5ml.webp"
                  alt="Decant Cruzial Parfums de 5 ml"
                  fill
                  sizes="(max-width: 899px) 50vw, 23vw"
                  className={styles.mosaicImage}
                  style={{ objectPosition: "50% 50%" }}
                  loading="lazy"
                />
              </div>
              <figcaption>Fragancias y decants preparados por Cruzial Parfums.</figcaption>
            </figure>
          </Reveal>
        </div>

        <Reveal>
          <div className={styles.formats}>
            <div className={styles.formatsHead}>
              <h3>Un decant no es una muestra.</h3>
            </div>
            <ul className={styles.formatList}>
              {decantSizes.map((decant) => (
                <li key={decant.size}>
                  <strong className={styles.formatNumeral}>
                    {decant.size}
                    <span>ml</span>
                  </strong>
                  <div>
                    <span className={styles.formatSprays}>
                      ≈ {PARFUMS_ATOMIZATIONS?.[decant.size] ?? "—"} atomizaciones
                    </span>
                    <p>{decant.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {PARFUMS_HOME_VIDEO ? (
        <VideoStory video={PARFUMS_HOME_VIDEO} tone="parfums" />
      ) : (
        <TikTokProfile
          tone="parfums"
          eyebrow="TikTok"
          title="Cruzial en TikTok"
          text="Sigue el perfil oficial de Cruzial para ver sus publicaciones en video."
          posterSrc="/images/parfums-home/parfums-final-cta.webp"
          posterAlt="Frascos de perfume sobre roca con luz dorada, imagen de marca"
        />
      )}

      <section className={styles.combos} aria-labelledby="combos-title">
        <Image src="/images/parfums-home/parfums-combos-bg.webp" alt="" fill sizes="100vw" loading="lazy" className={styles.combosBg} />
        <div className={styles.combosInner}>
          <div className={styles.sectionHead}>
            <div>
              <h2 id="combos-title">
                Combos <em>Cruzial</em>.
              </h2>
            </div>
            {combos.length > 0 ? (
              <Link href="/parfums/combos">
                Ver todos los combos <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
          {combos.length > 0 ? <ComboCarousel combos={combos} photosBySlug={comboPhotos} /> : null}
          <div className={styles.buildRow}>
            <p>
              <strong>¿Prefieres elegir tú?</strong> Arma tu combo con 3 a 6 fragancias y define el tamaño de cada una — 3, 5 o 10 ml.
            </p>
            <Link href="/parfums/combos#arma-combo" className={styles.buildLink}>
              Armar mi combo <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title" id="faq">
        <Reveal>
          <div className={styles.faqGrid}>
            <div className={styles.faqHead}>
              <h2 id="faq-title">
                Antes de <em>escribirnos</em>.
              </h2>
              <Link href="/parfums/nosotros#faq" className={styles.textLink}>
                Ver todas <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className={styles.faqList}>
              {homeFaqs.map((item) => (
                <details key={item.q} className={styles.faqItem}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
