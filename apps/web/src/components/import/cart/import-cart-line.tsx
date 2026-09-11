"use client";

import { useCallback } from "react";
import type { ImportCartLine as ImportCartLineType } from "@/domains/carts/import-cart";
import { IMPORT_CART_MAX_QUANTITY } from "@/domains/carts/import-cart";
import { useImportCart } from "./use-import-cart";
import styles from "./import-cart.module.css";

function formatPrice(price: string, currency: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: currency === "PEN" ? "PEN" : currency,
    minimumFractionDigits: 2,
  }).format(num);
}

type CartLineProps = {
  line: ImportCartLineType;
};

export function ImportCartLineItem({ line }: CartLineProps) {
  const { setQuantity, remove } = useImportCart();

  const handleDecrease = useCallback(() => {
    setQuantity(line.offerId, line.quantity - 1);
  }, [line.offerId, line.quantity, setQuantity]);

  const handleIncrease = useCallback(() => {
    setQuantity(line.offerId, line.quantity + 1);
  }, [line.offerId, line.quantity, setQuantity]);

  const handleRemove = useCallback(() => {
    remove(line.offerId);
  }, [line.offerId, remove]);

  const lineTotal = (parseFloat(line.price) * line.quantity).toFixed(2);

  return (
    <article className={styles.cartLine} aria-label={`${line.productName} — ${line.label}`}>
      <div className={styles.lineInfo}>
        <p className={styles.lineProduct}>{line.productName}</p>
        <p className={styles.lineLabel}>{line.label}</p>
        <p className={styles.lineUnitPrice}>
          {formatPrice(line.price, line.currency)} / unidad
        </p>
      </div>
      <div className={styles.lineControls}>
        <div className={styles.quantityGroup} role="group" aria-label={`Cantidad de ${line.productName}`}>
          <button
            type="button"
            onClick={handleDecrease}
            disabled={line.quantity <= 1}
            className={styles.qtyButton}
            aria-label="Disminuir cantidad"
          >
            −
          </button>
          <output className={styles.qtyOutput} aria-live="polite">
            {line.quantity}
          </output>
          <button
            type="button"
            onClick={handleIncrease}
            disabled={line.quantity >= IMPORT_CART_MAX_QUANTITY}
            className={styles.qtyButton}
            aria-label="Aumentar cantidad"
          >
            +
          </button>
        </div>
        <p className={styles.lineTotal}>{formatPrice(lineTotal, line.currency)}</p>
        <button
          type="button"
          onClick={handleRemove}
          className={styles.removeButton}
          aria-label={`Eliminar ${line.productName} del carrito`}
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}
