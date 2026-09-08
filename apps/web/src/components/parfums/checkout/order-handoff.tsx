"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import { handoffStorageKey } from "@/domains/orders/parfums-order-handoff";
import { buildWhatsAppUrl } from "@/domains/whatsapp/parfums-message-builder";
import styles from "./order-handoff.module.css";

export function OrderHandoff({
  orderNumber,
  whatsappNumber,
}: {
  orderNumber: string;
  whatsappNumber: string;
}) {
  const fallbackUrl = buildWhatsAppUrl(
    whatsappNumber,
    `Hola Cruzial Parfums. Quiero continuar la coordinación de mi solicitud ${orderNumber}.`,
  );
  const readHandoff = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(handoffStorageKey(orderNumber));
      if (stored?.startsWith(`https://wa.me/${whatsappNumber}?text=`)) return stored;
    } catch {
      // Storage can be unavailable; the reference-only fallback remains safe.
    }
    return fallbackUrl;
  }, [fallbackUrl, orderNumber, whatsappNumber]);
  const subscribe = useCallback(() => () => undefined, []);
  const getServerSnapshot = useCallback(() => fallbackUrl, [fallbackUrl]);
  const whatsappUrl = useSyncExternalStore(subscribe, readHandoff, getServerSnapshot);

  return (
    <div className={styles.page}>
      <Breadcrumbs items={[
        { label: "Catálogo", href: "/parfums/catalogo" as Route },
        { label: "Solicitud registrada" },
      ]} />
      <section className={styles.card} aria-labelledby="handoff-title">
        <p className={styles.eyebrow}>Solicitud registrada</p>
        <h1 id="handoff-title">Ahora coordinemos<br /><em>por WhatsApp.</em></h1>
        <p className={styles.message}>Tu solicitud fue registrada. Termina la coordinación por WhatsApp.</p>
        <div className={styles.reference}>
          <span>Referencia</span>
          <strong>{orderNumber}</strong>
        </div>
        <a className={styles.primary} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          Continuar por WhatsApp <span aria-hidden="true">↗</span>
        </a>
        <Link className={styles.secondary} href={"/parfums/catalogo" as Route}>Volver al catálogo</Link>
        <p className={styles.note}>Abrir WhatsApp no confirma el pedido ni registra un pago. Nuestro equipo coordinará disponibilidad, entrega y los siguientes pasos.</p>
      </section>
    </div>
  );
}
