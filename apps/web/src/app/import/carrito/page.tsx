"use client";

import type { Route } from "next";
import Link from "next/link";
import { useImportCart } from "@/components/import/cart/use-import-cart";
import { ImportCartLineItem } from "@/components/import/cart/import-cart-line";
import styles from "./page.module.css";

function formatPrice(total: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(total);
}

export default function ImportCartPage() {
  const { lines } = useImportCart();

  const displaySubtotal = lines.reduce((sum, line) => {
    return sum + parseFloat(line.price) * line.quantity;
  }, 0);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.heading}>Carrito de Import</h1>

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
