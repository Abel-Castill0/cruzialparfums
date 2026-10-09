import { Reveal } from "@/components/storefront/home/reveal";
import type { BusinessUnitSettings } from "@/domains/platform/settings";
import styles from "./import-home.module.css";

/**
 * Stands in for the product rail, the categories and the catalog while there
 * is no open consolidado. It says what is true in that state, shows nothing
 * that could read as available, and points to the information that stays
 * valid: how a consolidado works, its conditions and the contact channel.
 */
export function ImportClosedNotice({
  contact,
  unavailable,
  informationHref,
}: {
  contact: BusinessUnitSettings | null;
  unavailable: boolean;
  informationHref?: string;
}) {
  const waUrl = contact
    ? `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Import, quiero saber cuándo abre el próximo consolidado.")}`
    : "";

  return (
    <section className={styles.closedNotice} aria-labelledby="import-closed-notice-title">
      <Reveal className={styles.closedNoticeInner}>
        <div>
          <p className={styles.eyebrow}>Catálogo</p>
          <h2 id="import-closed-notice-title">
            {unavailable ? "No pudimos consultar el catálogo." : "Consolidado cerrado"}
          </h2>
        </div>
        <div className={styles.closedNoticeBody}>
          <ul>
            <li>
              <strong>Productos y precios</strong>
              <span>
                {unavailable
                  ? "No pudimos consultar el estado del consolidado y por eso no se pueden realizar compras ahora. Inténtalo de nuevo en unos minutos o escríbenos por WhatsApp."
                  : "No hay un consolidado activo en este momento y no se pueden realizar compras. El catálogo volverá a mostrarse cuando el próximo consolidado se confirme y abra."}
              </span>
            </li>
            <li>
              <strong>Mientras tanto</strong>
              <span>
                {informationHref
                  ? "Conoce las condiciones y cómo funciona un consolidado."
                  : "Revisa cómo funciona un consolidado y sus condiciones más abajo."}
                {informationHref ? <a href={informationHref}> Ver información de Cruzial Import</a> : null}
              </span>
            </li>
          </ul>
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className={styles.secondaryAction}>
              Preguntar por el próximo consolidado
            </a>
          ) : null}
        </div>
      </Reveal>
    </section>
  );
}
