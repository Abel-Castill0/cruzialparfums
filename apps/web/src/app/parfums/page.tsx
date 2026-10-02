import type { CSSProperties } from "react";
import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ComboCarousel } from "@/components/parfums/home/combo-carousel";
import { FinderDiscovery } from "@/components/parfums/home/finder-discovery";
import { HeroCarousel, type HeroSlide } from "@/components/parfums/home/hero-carousel";
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

// The hero rotates through the four real banner assets already used by the
// brand's GitHub Pages storefront. Mobile focal points keep the perfume set
// visible in the narrow crop. All messaging stays out of the image.
const heroSlides: readonly HeroSlide[] = [
  {
    src: "/parfums/hero/hero-crop.webp",
    alt: "Composición de Cruzial Parfums con frascos de diseñador y el nombre de la marca",
    position: "50% 50%",
    mobilePosition: "50% 50%",
  },
  {
    src: "/parfums/hero/promo-cuarteto.webp",
    alt: "Composición del Cuarteto Oriental con sus frascos y cajas sobre una superficie de mármol",
    position: "64% 50%",
    mobilePosition: "78% 50%",
  },
  {
    src: "/parfums/hero/promo-vainilla.webp",
    alt: "Composición de Vainilla Freak con frascos rosados, vainilla y flores",
    position: "62% 50%",
    mobilePosition: "78% 50%",
  },
  {
    src: "/parfums/hero/promo-tulum.webp",
    alt: "Composición del set Tulum con fragancias verdes y cítricos junto al mar",
    position: "64% 50%",
    mobilePosition: "72% 50%",
  },
];

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
  const showcase = selectShowcaseProducts(catalog.listFeatured(), fragrances).map(toShowcaseItem);
  const typeCounts = countFragrancesByType(fragrances);

  return (
    <main className={styles.home}>
      <h1 className={styles.srOnly}>Perfumería de descubrimiento.</h1>

      <HeroCarousel slides={heroSlides} ctaHref="/parfums/catalogo" ctaLabel="Explorar catálogo" />

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
                  <p className={styles.eyebrow}>Del catálogo</p>
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
              <p className={styles.eyebrow}>Catálogo</p>
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
            <p className={styles.eyebrow}>Cómo trabajamos</p>
            <h2 id="craft-title">
              Del frasco original <em>a tu piel</em>.
            </h2>
            <ol className={styles.principles}>
              {principios.map((principio) => (
                <li key={principio.num}>
                  <span>{principio.num}</span>
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
                  src="/parfums/hero/promo-cuarteto.webp"
                  alt="Cuatro fragancias con sus cajas sobre una superficie de mármol dorado"
                  fill
                  sizes="(max-width: 899px) 100vw, 46vw"
                  className={styles.mosaicImage}
                  style={{ objectPosition: "60% 50%" }}
                  loading="lazy"
                />
              </div>
              <div className={styles.mosaicCell}>
                <Image
                  src="/parfums/hero/promo-tulum.webp"
                  alt="Frascos verdes junto a coco, naranja y maracuyá en una escena de playa"
                  fill
                  sizes="(max-width: 899px) 50vw, 23vw"
                  className={styles.mosaicImage}
                  style={{ objectPosition: "40% 50%" }}
                  loading="lazy"
                />
              </div>
              <div className={styles.mosaicCell}>
                <Image
                  src="/parfums/hero/promo-vainilla.webp"
                  alt="Frascos rosados entre vainilla, flores y merengues"
                  fill
                  sizes="(max-width: 899px) 50vw, 23vw"
                  className={styles.mosaicImage}
                  style={{ objectPosition: "72% 50%" }}
                  loading="lazy"
                />
              </div>
              <figcaption>Imágenes de campaña de Cruzial Parfums.</figcaption>
            </figure>
          </Reveal>
        </div>

        <Reveal>
          <div className={styles.formats}>
            <div className={styles.formatsHead}>
              <p className={styles.eyebrow}>Prueba antes de invertir</p>
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
        <div className={styles.combosInner}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Sets</p>
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
          {combos.length > 0 ? <ComboCarousel combos={combos} /> : null}
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
              <p className={styles.eyebrow}>Preguntas frecuentes</p>
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
