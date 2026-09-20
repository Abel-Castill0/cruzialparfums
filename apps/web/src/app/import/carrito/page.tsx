"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useImportCart } from "@/components/import/cart/use-import-cart";
import { ImportCartLineItem } from "@/components/import/cart/import-cart-line";
import { getCurrentImportCampaign, type CurrentImportCampaign } from "./actions";
import styles from "./page.module.css";

function formatPrice(total: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(total);
}

export default function ImportCartPage() {
  const [campaign, setCampaign] = useState<CurrentImportCampaign>(null);
  useEffect(() => {
    let active = true;
    getCurrentImportCampaign().then((result) => {
      if (active) setCampaign(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const { lines, reconciliation } = useImportCart(campaign);

  const displaySubtotal = lines.reduce((sum, line) => {
    return sum + parseFloat(line.price) * line.quantity;
  }, 0);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.heading}>Carrito de Import</h1>
        {campaign && (
          <p className={styles.summaryNote} aria-live="polite">
            Consolidado vigente: #{campaign.number}
          </p>
        )}
        {reconciliation?.status === "discarded" && (
          <div className={styles.noticeBanner} role="status" aria-live="polite">
            <p>
              {reconciliation.reason === "campaign_changed"
                ? "El consolidado cambió desde tu última visita. Vaciamos tu carrito anterior para evitar precios u ofertas de un consolidado distinto."
                : "No pudimos confirmar a qué consolidado pertenecía tu carrito guardado, así que lo vaciamos por seguridad."}
            </p>
          </div>
        )}

        {lines.length === 0 ? (
          <div className={styles.empty}>
            <p>Tu carrito de Import está vacío.</p>
            <Link href={"/import#catalogo" as Route} className={styles.primaryAction}>
              Ver catálogo
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.lines} role="list" aria-label="Productos en el carrito">
              {lines.map((line) => (
                <div key={line.offerId} role="listitem">
                  <ImportCartLineItem line={line} />
                </div>
              ))}
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Subtotal estimado</span>
                <strong>{formatPrice(displaySubtotal)}</strong>
              </div>
              <p className={styles.summaryNote}>
                Los precios y disponibilidad se verifican nuevamente al registrar tu solicitud.
              </p>
              <p className={styles.summaryNote}>
                El anticipo se calcula al registrar (50% clientes nuevos, 70% clientes verificados).
              </p>
              <div className={styles.actions}>
              <Link href={"/import/checkout" as Route} className={styles.primaryAction}>
                Continuar al checkout
              </Link>
              <Link href={"/import#catalogo" as Route} className={styles.secondaryAction}>
                Seguir comprando
              </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
