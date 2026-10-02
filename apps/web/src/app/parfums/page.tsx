import type { CSSProperties } from "react";
import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ComboCarousel } from "@/components/parfums/home/combo-carousel";
import {
  countFragrancesByType,
  selectShowcaseProducts,
  toShowcaseItem,
} from "@/components/parfums/home/showcase";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { ProductMarquee } from "@/components/storefront/home/product-marquee";
import { Reveal } from "@/components/storefront/home/reveal";
import { VideoStory } from "@/components/storefront/home/video-story";
import { PARFUMS_HOME_VIDEO } from "@/domains/platform/home-video";
import { PARFUMS_ATOMIZATIONS, PARFUMS_BRAND_MEDIA } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cruzial Parfums",
  description: "Decants, frascos y combos de perfumería árabe, designer y de nicho en Perú.",
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
// duplicate copy fork. Full FAQ (6 items) lives on Nosotros.
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
  {
    q: "¿Compran al por mayor?",
    a: "Sí. Tenemos tarifas especiales para revendedores, tiendas, barberías y creadores. Revisa nuestra sección Mayorista.",
  },
];

export default async function ParfumsHomePage() {
  const { catalog, source } = await loadParfumsStorefront();
  const combos = catalog.listCombos();
  const fragrances = catalog.listFragrances();
  const showcase = selectShowcaseProducts(catalog.listFeatured(), fragrances).map(toShowcaseItem);
  const typeCounts = countFragrancesByType(fragrances);
  const { heroUrl } = PARFUMS_BRAND_MEDIA;

  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-hero-title">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt="Cruzial Parfums — perfumería árabe, designer y de nicho"
            fill
            sizes="100vw"
            preload
            className={styles.heroImage}
          />
        ) : null}
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}>Cruzial Parfums</p>
          <h1 id="home-hero-title">Perfumería de descubrimiento.</h1>
          <p className={styles.heroSummary}>
            Decants desde 3 ml y frascos completos, con envío por agencia Shalom.
          </p>
          <div className={styles.heroActions}>
            <Link href="/parfums/catalogo" className={styles.heroCta}>
              Explorar catálogo <span aria-hidden="true">→</span>
            </Link>
            <Link href="/parfums/finder" className={styles.heroLink}>
              Encuentra tu fragancia
            </Link>
          </div>
        </div>
      </section>

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
              <p className={styles.eyebrow}>Descubre</p>
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
        <Reveal>
          <div className={styles.finderRow}>
            <h3>¿No sabes por dónde empezar?</h3>
            <p>Responde 5 preguntas y recibe opciones explicables del catálogo. Reglas deterministas, no inteligencia artificial.</p>
            <Link href="/parfums/finder" className={styles.textLink}>
              Iniciar Finder <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
      </section>

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
            <div className={styles.craftMedia}>
              <Image
                src="/images/parfums-home/parfums-custom-combo.webp"
                alt="Decants Cruzial de 3, 5 y 10 ml junto a su caja de presentación"
                fill
                sizes="(max-width: 899px) 100vw, 46vw"
                className={styles.craftImage}
                loading="lazy"
              />
            </div>
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

      {PARFUMS_HOME_VIDEO ? <VideoStory video={PARFUMS_HOME_VIDEO} tone="parfums" /> : null}

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

      <section className={styles.wholesale} aria-labelledby="wholesale-title">
        <Reveal>
          <div className={styles.wholesaleInner}>
            <div>
              <p className={styles.eyebrow}>Cruzial Business</p>
              <h2 id="wholesale-title">
                ¿Compras para <em>revender</em>?
              </h2>
              <p>Tarifas por volumen para tiendas, barberías, salones y creadores.</p>
            </div>
            <Link href="/parfums/mayorista" className={styles.outlineCta}>
              Ver Mayorista <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
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
