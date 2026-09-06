import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { InstitutionalContactForm } from "@/components/parfums/institutional/institutional-contact-form";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Contacto",
  description: "WhatsApp directo, asesoría olfativa y atención personalizada para menor y mayor.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Contacto" },
];

export default function ContactoPage() {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();
  const whatsappNumber = config.WA_NUMBER ?? "51924590921";
  const instagramUrl = config.INSTAGRAM_URL ?? "https://www.instagram.com/Cruzial_parfum/";
  const instagramHandle = config.INSTAGRAM_HANDLE ?? "@Cruzial_parfum";

  const storeName = "Cruzial Parfums";

  return (
    <>
      <div className={styles.breadcrumbs}>
        <Breadcrumbs items={crumbs} />
      </div>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Hablemos</p>
        <h1>
          Una consulta,
          <br />
          <em>un aroma nuevo.</em>
        </h1>
        <p>¿No sabes qué perfume elegir? Cuéntanos cómo quieres oler y te recomendamos una selección a tu medida.</p>
      </section>

      <section className={styles.section} style={{ paddingTop: 0 }}>
        <div className={styles.wrap}>
          <div className={styles.contactGrid}>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true">✉</div>
              <h3>WhatsApp</h3>
              <p>La vía más rápida para pedidos, consultas y cotizaciones.</p>
              <span className={styles.contactValue}>924 590 921</span>
              <a className={styles.textLink} href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                Escribir ahora <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true">✈</div>
              <h3>Envíos</h3>
              <p>Delivery por la Línea 1 del tren eléctrico, motorizado para otras zonas de Lima y agencia Shalom a todo el Perú.</p>
              <span className={styles.contactValue}>Contraentrega en Lima</span>
            </div>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true">◉</div>
              <h3>Instagram</h3>
              <p>Lanzamientos, notas olfativas y detrás de escena de la casa.</p>
              <span className={styles.contactValue}>{instagramHandle}</span>
              <a className={styles.textLink} href={instagramUrl} target="_blank" rel="noopener noreferrer">
                Seguir <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true">◷</div>
              <h3>Contacto oficial</h3>
              <p>Atención personalizada para tus pedidos y asesorías. El pedido se confirma con el 50% de adelanto.</p>
              <span className={styles.contactValue}>WhatsApp 924 590 921</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.band}`}>
        <div className={styles.wrap}>
          <div className={styles.formSplit}>
            <div>
              <span className={styles.eyebrow}>Escríbenos</span>
              <h2>
                Cuéntanos, <em>te asesoramos</em>.
              </h2>
              <p>¿Buscas un aroma para una ocasión especial? ¿Quieres armar un regalo? ¿Necesitas tarifas por mayor? Este formulario llega directo a nuestro WhatsApp.</p>
            </div>
            <InstitutionalContactForm storeName={storeName} whatsappNumber={whatsappNumber} />
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTop}`}>
        <div className={styles.wrap}>
          <div className={styles.split}>
            <div className={styles.splitCopy}>
              <span className={styles.eyebrow}>¿No sabes por dónde empezar?</span>
              <h2 className={styles.splitTitle}>
                Empieza con un
                <br />
                <em>discovery de 3.</em>
              </h2>
              <p>Tres fragancias, tres familias, tu próxima firma olfativa. Te ayudamos a elegirlas.</p>
              <div className={styles.actions}>
                <Link className={styles.btnPrimary} href="/parfums/catalogo">
                  Elegir fragancias <span aria-hidden="true">→</span>
                </Link>
                <a
                  className={styles.btnGhost}
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Parfums, quiero armar un discovery de 3 fragancias.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Armar mi discovery <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            <div className={styles.splitArt} aria-hidden="true">
              <span className={styles.artMark}>3</span>
              <span className={styles.artCaption}>Formatos 3 · 5 · 10 ml</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}