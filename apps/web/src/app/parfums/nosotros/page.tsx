import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Nosotros",
  description: "Perfumería de descubrimiento. Menos volumen, más criterio. Del frasco original a tu piel.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Nosotros" },
];

const principios = [
  {
    num: "01",
    title: "Originalidad absoluta",
    text: "Solo trabajamos con frascos auténticos de las casas oficiales. Cada decant se prepara con material nuevo: jeringa, envase y guantes limpios por cliente.",
  },
  {
    num: "02",
    title: "Selección curada",
    text: "No vendemos ruido. Cada fragancia del catálogo pasó una prueba de carácter: proyección, duración y versatilidad. Si no merece tu piel, no está aquí.",
  },
  {
    num: "03",
    title: "Atención humana",
    text: "Tu pedido termina en una conversación real por WhatsApp. Asesoramos, confirmamos stock y coordinamos tu entrega como lo haría una perfumería boutique.",
  },
];

const pasos = [
  {
    icon: "✦",
    title: "Elige tu formato",
    text: "Cada fragancia está disponible en 3, 5 y 10 ml. Empieza pequeño y escala cuando lo sientas tuyo.",
  },
  {
    icon: "+",
    title: "Añade al carrito",
    text: "Arma tu selección a tu ritmo. Tu carrito se guarda para que vuelvas cuando quieras sin perder nada.",
  },
  {
    icon: "✉",
    title: "Confirma por WhatsApp",
    text: "Envías tu pedido con un mensaje listo. Confirmamos stock, envío y total, y coordinan el despacho.",
  },
];

const faqs = [
  {
    q: "¿Qué es un decant?",
    a: "Es la misma fragancia original, trasvasada desde el frasco auténtico a envases de 3, 5 y 10 ml. Conserva exactamente el mismo aroma, proyección y duración, sin alteraciones.",
  },
  {
    q: "¿Son perfumes originales o réplicas?",
    a: "100% originales. Trabajamos con frascos auténticos de las casas oficiales y preparamos los decants con jeringas nuevas por cada cliente y producto.",
  },
  {
    q: "¿Cómo hago mi pedido?",
    a: "Añade tus fragancias al carrito, completa tus datos y envía tu pedido por WhatsApp. El pedido se confirma con el 50% de adelanto; coordinamos stock, envío y total antes de cerrar la venta.",
  },
  {
    q: "¿Cómo son los envíos?",
    a: "Delivery por la Línea 1 del tren eléctrico en Lima, motorizado para otras zonas y envío a provincias por agencia Shalom u Olva.",
  },
  {
    q: "¿Qué presentación tienen los decants?",
    a: "La perfumería árabe se presenta en decant clásico. En diseñador y nicho, los formatos de 5 y 10 ml usan decant premium y el de 3 ml presentación clásica.",
  },
  {
    q: "¿Compran al por mayor?",
    a: "Sí. Tenemos tarifas especiales para revendedores, tiendas, barberías y creadores. Escríbenos por WhatsApp o revisa nuestra sección Mayorista.",
  },
];

export default function NosotrosPage() {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();
  const whatsappNumber = config.WA_NUMBER ?? "51924590921";

  return (
    <>
      <div className={styles.breadcrumbs}>
        <Breadcrumbs items={crumbs} />
      </div>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Nuestra Historia</p>
        <h1>
          Nacimos para que
          <br />
          <em>pruebes antes de jurar.</em>
        </h1>
        <p>Porque nadie debería comprar un frasco completo a ciegas. Ese fue el inicio de todo.</p>
      </section>

      <section className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.wrap}>
          <div className={styles.split}>
            <div className={styles.splitArt} aria-hidden="true">
              <span className={styles.artMark}>C</span>
              <span className={styles.artCaption}>La casa · Fundada con criterio y carácter</span>
            </div>
            <div className={styles.splitCopy}>
              <span className={styles.eyebrow}>La Casa</span>
              <h2 className={styles.splitTitle}>
                No vendemos perfumes.
                <br />
                <em>Vendemos seguridad olfativa.</em>
              </h2>
              <p>Cruzial Parfums nace de una frustración simple: comprar un perfume caro y descubrir a los tres días que no era para ti.</p>
              <div className={styles.miniStats}>
                <div className={styles.miniStat}>
                  <strong>100%</strong>
                  <span>Originales</span>
                </div>
                <div className={styles.miniStat}>
                  <strong>3 · 5 · 10 ml</strong>
                  <span>Formatos</span>
                </div>
              </div>
              <div className={styles.actions}>
                <Link className={styles.btnPrimary} href="/parfums/catalogo">
                  Conocer la colección <span aria-hidden="true">→</span>
                </Link>
                <Link className={styles.btnGhost} href="/parfums/mayorista">
                  Venta por mayor <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.band}`}>
        <div className={styles.wrap}>
          <div className={styles.centerBlock}>
            <span className={styles.eyebrow}>Lo que nos define</span>
            <div className={styles.heading}>
              <h2>
                Tres principios, <em>sin excepciones</em>.
              </h2>
            </div>
          </div>
          <div className={styles.cardGrid}>
            {principios.map((item) => (
              <article className={styles.card} key={item.num}>
                <span className={styles.cardNum}>{item.num}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="como-comprar">
        <div className={styles.wrap}>
          <div className={styles.centerBlock}>
            <span className={styles.eyebrow}>Cómo Comprar</span>
            <div className={styles.heading}>
              <h2>
                Tres pasos, <em>cero fricción</em>.
              </h2>
            </div>
            <p>Sin pasarelas ni complicaciones: elige, arma tu selección y confirma por WhatsApp con un asesor real.</p>
          </div>
          <div className={styles.steps}>
            {pasos.map((step) => (
              <article className={styles.step} key={step.title}>
                <span className={styles.stepIcon} aria-hidden="true">{step.icon}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.band}`} id="faq">
        <div className={styles.wrap}>
          <div className={styles.centerBlock}>
            <span className={styles.eyebrow}>Preguntas Frecuentes</span>
            <div className={styles.heading}>
              <h2>
                Todo lo que <em>necesitas saber</em>.
              </h2>
            </div>
          </div>
          <div className={styles.faq}>
            {faqs.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTop}`}>
        <div className={styles.wrap}>
          <div className={styles.split}>
            <div className={styles.splitCopy}>
              <span className={styles.eyebrow}>¿Listo para tu siguiente paso?</span>
              <h2 className={styles.splitTitle}>
                Descubre tu <em>firma olfativa</em> hoy.
              </h2>
              <p>Empieza con un decant de 3 ml y deja que tu nariz decida. Nosotros nos encargamos del resto.</p>
              <div className={styles.actions}>
                <Link className={styles.btnPrimary} href="/parfums/catalogo">
                  Explorar colección <span aria-hidden="true">→</span>
                </Link>
                <a
                  className={styles.btnGhost}
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Parfums, quiero una recomendación de fragancia.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Pedir recomendación <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            <div className={styles.splitArt} aria-hidden="true">
              <span className={styles.artMark}>✦</span>
              <span className={styles.artCaption}>Decants 3 · 5 · 10 ml</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}