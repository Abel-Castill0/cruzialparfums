import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ComboCarousel } from "@/components/parfums/home/combo-carousel";
import { FeaturedPerfumeRail } from "@/components/parfums/home/featured-perfume-rail";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cruzial Parfums",
  description: "Decants, frascos, combos y fragancias de entrega inmediata en Lima, Perú.",
};

const discoveryCategories = [
  { type: "arab", label: "Perfumería árabe", note: "Lattafa, Afnan, Rasasi y más" },
  { type: "designer", label: "Designer", note: "Casas reconocidas internacionalmente" },
  { type: "niche", label: "Nicho", note: "Selección de autor" },
] as const;

const principios = [
  {
    num: "01",
    title: "Originalidad absoluta",
    text: "Solo trabajamos con frascos auténticos de las casas oficiales. Cada decant se prepara con material nuevo por cliente.",
  },
  {
    num: "02",
    title: "Selección curada",
    text: "El catálogo pasa un filtro de carácter: proyección, duración y versatilidad antes de entrar.",
  },
  {
    num: "03",
    title: "Atención humana",
    text: "Tu pedido termina en una conversación real por WhatsApp: asesoramos, confirmamos stock y coordinamos la entrega.",
  },
];

// Same source as /parfums/nosotros#faq — this is a condensed teaser, not a
// duplicate copy fork. Full FAQ (6 items) lives on Nosotros.
const homeFaqs = [
  {
    q: "¿Qué es un decant?",
    a: "Es la misma fragancia original, trasvasada desde el frasco auténtico a envases de 3, 5 y 10 ml. Conserva exactamente el mismo aroma, proyección y duración.",
  },
  {
    q: "¿Son perfumes originales o réplicas?",
    a: "100% originales. Trabajamos con frascos auténticos de las casas oficiales y preparamos los decants con jeringas nuevas por cada cliente y producto.",
  },
  {
    q: "¿Cómo hago mi pedido?",
    a: "Añade tus fragancias al carrito, completa tus datos y envía tu pedido por WhatsApp. El pedido se confirma con el 50% de adelanto.",
  },
  {
    q: "¿Compran al por mayor?",
    a: "Sí. Tenemos tarifas especiales para revendedores, tiendas, barberías y creadores. Revisa nuestra sección Mayorista.",
  },
];

export default function ParfumsHomePage() {
  const catalog = new LegacyCatalogRepository();
  const combos = catalog.listCombos();
  const featured = catalog.listFeatured();
  const { heroUrl } = catalog.getHeroMedia();
  const { ATOMIZACIONES } = catalog.getStorefrontConfig();

  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-hero-title">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt="Cruzial Parfums — perfumería árabe, designer y de nicho"
            fill
            sizes="100vw"
            priority
            className={styles.heroImage}
          />
        ) : null}
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Cruzial Parfums</p>
          <h1 id="home-hero-title">Perfumería de descubrimiento.</h1>
          <p className={styles.heroSummary}>
            Decants desde 3 ml y frascos completos, entrega inmediata en Lima.
          </p>
          <Link href="/parfums/catalogo" className={styles.heroCta}>
            Explorar catálogo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="Por qué comprar en Cruzial">
        <div>
          <strong>100%</strong>
          <span>Originales</span>
          <p>Decants preparados desde frascos auténticos de las casas oficiales.</p>
        </div>
        <div>
          <strong>WhatsApp</strong>
          <span>Confirmación</span>
          <p>Un asesor revisa tu pedido y confirma stock, envío y total.</p>
        </div>
        <div>
          <strong>Shalom</strong>
          <span>Envío nacional</span>
          <p>Línea 1, motorizado y contraentrega en Lima; agencia a todo el Perú.</p>
        </div>
        <div>
          <strong>3 · 5 · 10</strong>
          <span>Formatos</span>
          <p>Empieza pequeño y escala cuando la fragancia te convenza.</p>
        </div>
      </section>

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
              <span className={styles.discoveryLabel}>{category.label}</span>
              <p>{category.note}</p>
              <span className={styles.discoveryArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      {combos.length > 0 ? (
        <section className={styles.comboSection} aria-labelledby="combo-carousel-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Sets ya armados</p>
              <h2 id="combo-carousel-title">Combos <em>Cruzial</em>.</h2>
            </div>
            <Link href="/parfums/combos">Ver todos los combos <span aria-hidden="true">→</span></Link>
          </div>
          <ComboCarousel combos={combos} />
        </section>
      ) : null}

      <section className={styles.finder} aria-labelledby="finder-title">
        <div>
          <p className={styles.eyebrow}>Encuentra tu fragancia</p>
          <h2 id="finder-title">¿No sabes por dónde <em>empezar</em>?</h2>
          <p>Responde 5 preguntas y te mostramos opciones explicables del catálogo actual. Reglas deterministas, no inteligencia artificial.</p>
        </div>
        <Link href="/parfums/finder" className={styles.finderCta}>
          Iniciar Finder <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className={styles.customCombo} aria-labelledby="custom-combo-title">
        <div>
          <p className={styles.eyebrow}>Arma tu combo</p>
          <h2 id="custom-combo-title">Tu selección, <em>tu regla</em>.</h2>
          <p>Elige de 3 a 6 fragancias y el tamaño de cada una por separado — 3, 5 o 10 ml, sin tamaño global.</p>
        </div>
        <Link href="/parfums/combos#arma-combo" className={styles.customComboCta}>
          Armar mi combo <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className={styles.decantEdu} aria-labelledby="decant-edu-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Prueba antes de invertir</p>
            <h2 id="decant-edu-title">Un decant no es una <em>muestra</em>.</h2>
          </div>
        </div>
        <div className={styles.decantGrid}>
          <article>
            <strong>3 ml</strong>
            <span>≈ {ATOMIZACIONES?.["3"] ?? "—"} atomizaciones</span>
            <p>Decant clásico. Para conocer una fragancia sin comprometerte con el frasco completo.</p>
          </article>
          <article>
            <strong>5 ml</strong>
            <span>≈ {ATOMIZACIONES?.["5"] ?? "—"} atomizaciones</span>
            <p>El punto medio: suficiente para llevarlo contigo varias semanas.</p>
          </article>
          <article>
            <strong>10 ml</strong>
            <span>≈ {ATOMIZACIONES?.["10"] ?? "—"} atomizaciones</span>
            <p>Rendimiento de meses. Para cuando ya sabes que es tu fragancia.</p>
          </article>
        </div>
      </section>

      <section className={styles.authenticity} aria-labelledby="authenticity-title">
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
      </section>

      <section className={styles.wholesaleCta} aria-labelledby="wholesale-cta-title">
        <div>
          <p className={styles.eyebrow}>Cruzial Business</p>
          <h2 id="wholesale-cta-title">¿Compras para <em>revender</em>?</h2>
          <p>Tarifas por volumen para tiendas, barberías, salones y creadores.</p>
        </div>
        <Link href="/parfums/mayorista" className={styles.wholesaleLink}>
          Ver Mayorista <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className={styles.evidence} aria-labelledby="evidence-title">
        <p className={styles.eyebrow}>Evidencia real</p>
        <h2 id="evidence-title">Próximamente</h2>
        <p>
          Estamos reuniendo fotos reales de pedidos y evidencia de despacho para
          mostrar aquí. No publicamos reseñas ni fotos que no sean nuestras.
        </p>
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
            <article key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
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
      </section>
    </main>
  );
}
