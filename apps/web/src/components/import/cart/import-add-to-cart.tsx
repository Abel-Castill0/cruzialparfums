"use client";

import { useCallback, useState } from "react";
import {
  addImportCartLine,
  type ImportCartCampaign,
  type ImportCartLine,
} from "@/domains/carts/import-cart";
import { IMPORT_CART_UPDATED_EVENT } from "@/domains/carts/import-cart";
import styles from "./import-add-to-cart.module.css";

type AddToCartButtonProps = {
  line: ImportCartLine;
  /** The consolidado this offer belongs to. Required so a cart left over
   * from a previous campaign is discarded instead of silently mixed with
   * this one — see reconcileImportCartForCampaign in domains/carts/import-cart. */
  campaign: ImportCartCampaign;
  disabled?: boolean;
};

export function ImportAddToCartButton({ line, campaign, disabled = false }: AddToCartButtonProps) {
  const [feedback, setFeedback] = useState<"idle" | "added">("idle");

  const handleClick = useCallback(() => {
    if (disabled) return;
    const result = addImportCartLine(localStorage, line, campaign);
    if (result.persisted) {
      window.dispatchEvent(new Event(IMPORT_CART_UPDATED_EVENT));
      setFeedback("added");
      setTimeout(() => setFeedback("idle"), 1800);
    }
  }, [line, campaign, disabled]);

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={styles.button}
        aria-live="polite"
      >
        {disabled ? "Agotado" : feedback === "added" ? "Agregado" : "Agregar al carrito"}
      </button>
      {feedback === "added" && (
        <span className={styles.srOnly} role="status">
          Producto agregado al carrito de Import
        </span>
      )}
    </div>
  );
}
