import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { BusinessUnitSettings } from "@/domains/platform/settings";
import type { PublicImportCampaign } from "@/domains/import/public-import";
import styles from "./import-home.module.css";

type HeroState =
  | { state: "campaign"; campaign: PublicImportCampaign }
  | { state: "upcoming"; campaign: PublicImportCampaign }
  | { state: "closed" | "unavailable" };

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

const ASSURANCES = ["Consolidado independiente", "Catálogo por campaña", "Delivery privado"] as const;

/**
 * Campaign poster: the container image carries the page, the copy stays
 * short. One heading id per state is kept because tests and anchors rely on
 * `#campaign-title` / `#import-closed-title`.
 */
export function ImportHero({
  hero,
  contact,
}: {
  hero: HeroState;
  contact: BusinessUnitSettings | null;
}) {
  const open = hero.state === "campaign";
  const upcoming = hero.state === "upcoming";
  const titleId = open ? "campaign-title" : "import-closed-title";

  return (
    <section className={styles.hero} data-import-home-hero aria-labelledby={titleId}>
      <div className={styles.heroVisual}>
        <Image
          src="/images/import-home/import-hero-container.webp"
          alt="Contenedor de carga Cruzial Import listo para consolidado"
          fill
          priority
          sizes="(max-width: 767px) 100vw, 70vw"
          className={styles.heroImage}
        />
      </div>

      <div className={styles.heroCopy}>
        {open ? (
          <p className={styles.heroStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            Consolidado #{hero.campaign.number} abierto
          </p>
        ) : (
          <p className={styles.heroStatus}>Cruzial Import</p>
        )}

        <h1 id={titleId}>
          {open
            ? hero.campaign.name
            : upcoming
              ? hero.campaign.name
              : hero.state === "unavailable"
                ? "Catálogo no disponible por ahora."
                : "El próximo consolidado se está preparando."}
        </h1>

        <p className={styles.heroSummary}>
          {open
            ? hero.campaign.publicMessage || "Precios exclusivos de este consolidado."
            : upcoming
              ? `Vista previa de productos. Apertura estimada: ${hero.campaign.opensAt ? formatClosingDate(hero.campaign.opensAt) : "por confirmar"}. El consolidado sigue cerrado hasta que el cliente confirme precios y disponibilidad.`
            : hero.state === "unavailable"
              ? "No pudimos consultar el estado del consolidado. Inténtalo nuevamente o contáctanos."
              : "Los productos y precios aparecerán cuando el próximo consolidado abra."}
        </p>

        <div className={styles.heroActions}>
          {open ? (
            <Link href={"/import/catalogo" as Route} className={styles.primaryAction}>
              Ver catálogo <ArrowIcon />
            </Link>
          ) : upcoming ? (
            <Link href={"/import/catalogo" as Route} className={styles.primaryAction}>Explorar vista previa <ArrowIcon /></Link>
          ) : null}
          {contact ? (
            <a
              href={whatsappUrl(contact.whatsappNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className={open ? styles.secondaryAction : styles.primaryAction}
            >
              <WhatsappIcon /> Consultar por WhatsApp
            </a>
          ) : (
            <p className={styles.primaryAction} role="status">
              Atención temporalmente no disponible.
            </p>
          )}
        </div>

        {open ? (
          <dl className={styles.heroFacts}>
            {hero.campaign.closesAt ? (
              <div>
                <dt>Cierre</dt>
                <dd>{formatClosingDate(hero.campaign.closesAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Precios</dt>
              <dd>Válidos para este consolidado</dd>
            </div>
            <div>
              <dt>Atención</dt>
              <dd>WhatsApp {contact?.whatsappDisplay ?? "no disponible"}</dd>
            </div>
          </dl>
        ) : upcoming ? (
          <dl className={styles.heroFacts}><div><dt>Estado</dt><dd>Apertura estimada</dd></div><div><dt>Catálogo</dt><dd>Vista previa · compra deshabilitada</dd></div></dl>
        ) : (
          <ul className={styles.assurances}>
            {ASSURANCES.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
