import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { InstitutionalContactForm } from "@/components/parfums/institutional/institutional-contact-form";
import { PARFUMS_INSTAGRAM_URL } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import { WhatsAppIcon } from "@/components/parfums/shell/shell-icons";
import styles from "@/components/parfums/institutional/institutional.module.css";

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const TruckIcon = () => (
  <Glyph><path d="M3 6.5h11v9H3zM14 10h4l3 3v2.5h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></Glyph>
);
const InstagramIcon = () => (
  <Glyph><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17" cy="7" r="0.6" fill="currentColor" /></Glyph>
);
const MailIcon = () => (
  <Glyph><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></Glyph>
);

export const metadata: Metadata = {
  title: "Contacto",
  description: "WhatsApp directo, asesoría olfativa y atención personalizada.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Contacto" },
];

export default async function ContactoPage() {
  const { contact } = await loadParfumsStorefront();
  const whatsappNumber = contact.whatsappNumber;
  const phoneDisplay = contact.whatsappDisplay;
  const contactEmail = contact.contactEmail;
  const instagramUrl = PARFUMS_INSTAGRAM_URL;
  const instagramHandle = "@Cruzial_parfum";

  const storeName = "Cruzial Parfums";

  return (
    <main>
      <div className={styles.breadcrumbs}>
        <Breadcrumbs items={crumbs} />
      </div>

      <section className={styles.hero}>
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
              <div className={styles.contactIcon} aria-hidden="true"><WhatsAppIcon size={20} /></div>
              <h3>WhatsApp</h3>
              <p>La vía más rápida para pedidos, consultas y cotizaciones.</p>
              <span className={styles.contactValue}>{phoneDisplay}</span>
              <a className={styles.textLink} href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                Escribir ahora <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true"><TruckIcon /></div>
              <h3>Envíos</h3>
              <p>Recoge en la agencia Shalom que elijas, o pide motorizado en Lima. El costo del motorizado se confirma por WhatsApp.</p>
              <span className={styles.contactValue}>Shalom · Motorizado</span>
            </div>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true"><InstagramIcon /></div>
              <h3>Instagram</h3>
              <p>Lanzamientos, notas olfativas y detrás de escena de la casa.</p>
              <span className={styles.contactValue}>{instagramHandle}</span>
              <a className={styles.textLink} href={instagramUrl} target="_blank" rel="noopener noreferrer">
                Seguir <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className={styles.contactCard}>
              <div className={styles.contactIcon} aria-hidden="true"><MailIcon /></div>
              <h3>Correo</h3>
              <p>Para consultas por escrito, cotizaciones extensas o coordinación fuera de WhatsApp.</p>
              <span className={styles.contactValue}>{contactEmail}</span>
              <a className={styles.textLink} href={`mailto:${contactEmail}`}>
                Escribir un correo <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.band}`}>
        <div className={styles.wrap}>
          <div className={styles.formSplit}>
            <div>
              <h2>
                Cuéntanos, <em>te asesoramos</em>.
              </h2>
              <p>¿Buscas un aroma para una ocasión especial? ¿Quieres armar un regalo? Este formulario llega directo a nuestro WhatsApp.</p>
            </div>
            <InstitutionalContactForm storeName={storeName} whatsappNumber={whatsappNumber} />
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTop}`}>
        <div className={styles.wrap}>
          <div className={styles.split}>
            <div className={styles.splitCopy}>
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
            <div className={styles.splitArt}>
              <Image src="/images/parfums-home/parfums-decant-3ml.webp" alt="Decant Cruzial Parfums de 3 ml" fill sizes="(max-width: 899px) 100vw, 46vw" className={styles.artImage} />
              <span className={styles.artCaption}>Formatos 3 · 5 · 10 ml</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
