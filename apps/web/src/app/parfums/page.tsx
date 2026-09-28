import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ComboCarousel } from "@/components/parfums/home/combo-carousel";
import { FeaturedPerfumeRail } from "@/components/parfums/home/featured-perfume-rail";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { PARFUMS_ATOMIZATIONS, PARFUMS_BRAND_MEDIA } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cruzial Parfums",
  description: "Decants, frascos y combos de perfumería árabe, designer y de nicho en Perú.",
};

const discoveryCategories = [
  {
    type: "arab",
    label: "Perfumería árabe",
    note: "Lattafa, Afnan, Rasasi y más",
    image: "/images/parfums-home/parfums-arabe.webp",
  },
  {
    type: "designer",
    label: "Designer",
    note: "Casas reconocidas internacionalmente",
    image: "/images/parfums-home/parfums-designer.webp",
  },
  {
    type: "niche",
    label: "Nicho",
    note: "Selección de autor",
    image: "/images/parfums-home/parfums-nicho.webp",
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
    label: "3 ml",
    image: "/images/parfums-home/parfums-decant-3ml.webp",
    text: "Decant clásico. Para conocer una fragancia sin comprometerte con el frasco completo.",
  },
  {
    size: "5",
    label: "5 ml",
    image: "/images/parfums-home/parfums-decant-5ml.webp",
    text: "El punto medio: suficiente para llevarlo contigo varias semanas.",
  },
  {
    size: "10",
    label: "10 ml",
    image: "/images/parfums-home/parfums-decant-10ml.webp",
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
  const featured = catalog.listFeatured();
  const { heroUrl } = PARFUMS_BRAND_MEDIA;
  const ATOMIZACIONES = PARFUMS_ATOMIZATIONS;

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
          <p className={styles.eyebrow}>Cruzial Parfums</p>
          <h1 id="home-hero-title">Perfumería de descubrimiento.</h1>
          <p className={styles.heroSummary}>
            Decants desde 3 ml y frascos completos, con envío por agencia Shalom.
          </p>
          <div className={styles.heroActions}>
            <Link href="/parfums/catalogo" className={styles.heroCta}>
              Explorar catálogo <span aria-hidden="true">→</span>
            </Link>
            <Link href="/parfums/combos#arma-combo" className={styles.heroCtaSecondary}>
              Arma tu combo <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="Por qué comprar en Cruzial">
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M8.7 12.2l2.2 2.2 4.4-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <strong>100%</strong>
          <span>Originales</span>
          <p>Decants preparados desde frascos auténticos de las casas oficiales.</p>
        </div>
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 4a8 8 0 00-6.9 12l-1 3.5 3.6-1A8 8 0 1012 4z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M9 10.3c.3 2 2.4 4.1 4.4 4.4.9.1 1.7-.5 1.9-1.3l.1-.5-2-1-.6.8c-1-.5-2-1.5-2.5-2.5l.8-.6-1-2-.5.1c-.8.2-1.4 1-1.3 1.9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <strong>WhatsApp</strong>
          <span>Confirmación</span>
          <p>Un asesor revisa tu pedido y confirma stock, envío y total.</p>
        </div>
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 7h11v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="7.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="17.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <strong>Shalom</strong>
          <span>Envío por agencia</span>
          <p>Agencia Shalom. Cobertura y costo se confirman por WhatsApp.</p>
        </div>
        <div>
          <svg className={styles.trustIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3h3v3H9zM9.5 6h2l1 2.4v10.6a1 1 0 01-1 1h-2a1 1 0 01-1-1V8.4L9.5 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M15.5 9h1.6l.8 1.9v8.6a.8.8 0 01-.8.8h-1.6a.8.8 0 01-.8-.8v-8.6L15.5 9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <strong>3 · 5 · 10</strong>
          <span>Formatos</span>
          <p>Empieza pequeño y escala cuando la fragancia te convenza.</p>
        </div>
      </section>

      {source === "unavailable" ? <CatalogUnavailableNotice /> : null}

      <FeaturedPerfumeRail products={featured} />

      <section className={styles.discovery} aria-labelledby="discovery-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Catálogo</p>
            <h2 id="discovery-title">Encuentra tu <em>familia</em>.</h2>
          </div>
          <Link href="/parfums/catalogo">Ver todo el catálogo <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.discoveryGrid}>
          {discoveryCategories.map((category) => (
            <Link
              key={category.type}
              href={`/parfums/catalogo?type=${category.type}` as Route}
              className={styles.discoveryCard}
            >
              <Image
                src={category.image}
                alt=""
                fill
                sizes="(max-width: 900px) 100vw, 33vw"
                className={styles.discoveryImage}
              />
              <div className={styles.discoveryScrim} aria-hidden="true" />
              <div className={styles.discoveryCopy}>
                <span className={styles.discoveryLabel}>{category.label}</span>
                <p>{category.note}</p>
                <span className={styles.discoveryArrow} aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {combos.length > 0 ? (
        <section className={styles.comboSection} aria-labelledby="combo-carousel-title">
          <div className={styles.comboSectionInner}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.eyebrow}>Sets ya armados</p>
                <h2 id="combo-carousel-title">Combos <em>Cruzial</em>.</h2>
                <p className={styles.comboSectionCopy}>
                  Fragancias cuidadosamente seleccionadas en sets exclusivos.
                </p>
              </div>
              <Link href="/parfums/combos">Ver todos los combos <span aria-hidden="true">→</span></Link>
            </div>
            <ComboCarousel combos={combos} />
          </div>
        </section>
      ) : null}

      <section className={styles.finder} aria-labelledby="finder-title">
        <Image
          src="/images/parfums-home/parfums-finder-bg.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.finderImage}
        />
        <div className={styles.finderScrim} aria-hidden="true" />
        <div className={styles.finderCopy}>
          <p className={styles.eyebrow}>Encuentra tu fragancia</p>
          <h2 id="finder-title">¿No sabes por dónde <em>empezar</em>?</h2>
          <p>Responde 5 preguntas y te mostramos opciones explicables del catálogo actual. Reglas deterministas, no inteligencia artificial.</p>
          <Link href="/parfums/finder" className={styles.finderCta}>
            Iniciar Finder <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className={styles.customCombo} aria-labelledby="custom-combo-title">
        <div className={styles.customComboCopy}>
          <p className={styles.eyebrow}>Arma tu combo</p>
          <h2 id="custom-combo-title">Tu selección, <em>tu regla</em>.</h2>
          <p>Elige de 3 a 6 fragancias y el tamaño de cada una por separado — 3, 5 o 10 ml, sin tamaño global.</p>
          <Link href="/parfums/combos#arma-combo" className={styles.customComboCta}>
            Armar mi combo <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.customComboMedia}>
          <Image
            src="/images/parfums-home/parfums-custom-combo.webp"
            alt="Decants Cruzial de 3, 5 y 10 ml junto a su caja de presentación"
            fill
            sizes="(max-width: 900px) 100vw, 46vw"
            className={styles.customComboImage}
          />
        </div>
      </section>

      <section className={styles.decantEdu} aria-labelledby="decant-edu-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Prueba antes de invertir</p>
            <h2 id="decant-edu-title">Un decant no es una <em>muestra</em>.</h2>
          </div>
        </div>
        <div className={styles.decantGrid}>
          {decantSizes.map((decant) => (
            <article key={decant.size}>
              <div className={styles.decantMedia}>
                <Image
                  src={decant.image}
                  alt=""
                  fill
                  sizes="(max-width: 900px) 50vw, 20vw"
                  className={styles.decantImage}
                />
              </div>
              <strong>{decant.label}</strong>
              <span>≈ {ATOMIZACIONES?.[decant.size] ?? "—"} atomizaciones</span>
              <p>{decant.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.authenticity} aria-labelledby="authenticity-title">
        <div className={styles.authenticityInner}>
          <div className={styles.authenticityBody}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.eyebrow}>Cómo trabajamos</p>
                <h2 id="authenticity-title">Autenticidad, sin <em>ruido</em>.</h2>
              </div>
              <Link href="/parfums/nosotros">Conoce Cruzial <span aria-hidden="true">→</span></Link>
            </div>
            <div className={styles.principiosGrid}>
              {principios.map((principio) => (
                <article key={principio.num}>
                  <span>{principio.num}</span>
                  <h3>{principio.title}</h3>
                  <p>{principio.text}</p>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.authenticityMedia}>
            <Image
              src="/images/parfums-home/parfums-authenticity.webp"
              alt="Frasco Cruzial Parfums"
              fill
              sizes="(max-width: 900px) 60vw, 22vw"
              className={styles.authenticityImage}
            />
          </div>
        </div>
      </section>

      <section className={styles.wholesaleCta} aria-labelledby="wholesale-cta-title">
        <div className={styles.wholesaleCopy}>
          <p className={styles.eyebrow}>Cruzial Business</p>
          <h2 id="wholesale-cta-title">¿Compras para <em>revender</em>?</h2>
          <p>Tarifas por volumen para tiendas, barberías, salones y creadores.</p>
          <Link href="/parfums/mayorista" className={styles.wholesaleLink}>
            Ver Mayorista <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.wholesaleMedia}>
          <Image
            src="/images/parfums-home/parfums-wholesale.webp"
            alt="Frasco Cruzial Parfums"
            fill
            sizes="(max-width: 900px) 60vw, 22vw"
            className={styles.wholesaleImage}
          />
        </div>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title" id="faq">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Preguntas frecuentes</p>
            <h2 id="faq-title">Antes de <em>escribirnos</em>.</h2>
          </div>
          <Link href="/parfums/nosotros#faq">Ver todas <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.faqGrid}>
          {homeFaqs.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <Image
          src="/images/parfums-home/parfums-final-cta.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.finalCtaImage}
        />
        <div className={styles.finalCtaScrim} aria-hidden="true" />
        <div className={styles.finalCtaContent}>
          <p className={styles.eyebrow}>Cruzial Parfums</p>
          <h2 id="final-cta-title">Tu próxima fragancia <em>empieza aquí</em>.</h2>
          <div className={styles.finalCtaActions}>
            <Link href="/parfums/catalogo" className={styles.finalCtaPrimary}>
              Explorar catálogo <span aria-hidden="true">→</span>
            </Link>
            <Link href="/parfums/finder" className={styles.finalCtaSecondary}>
              Usar el Finder <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
