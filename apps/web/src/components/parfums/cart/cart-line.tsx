import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  formatParfumsVariant,
  type ResolvedParfumsCartLine,
} from "@/domains/carts/parfums-cart-pricing";
import styles from "./cart-line.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

export function CartLine({
  line,
  compact = false,
  onQuantity,
  onRemove,
}: {
  line: ResolvedParfumsCartLine;
  compact?: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const { product, variant, quantity, subtotal } = line;
  const imageUrl = variant.group === "bottle"
    ? product.bottleImageUrl ?? product.imageUrl
    : product.decantImageUrl ?? product.imageUrl;

  return (
    <article className={`${styles.line} ${compact ? styles.compact : ""}`} data-cart-line={line.key}>
      <Link className={styles.media} href={`/parfums/productos/${product.slug}` as Route} aria-label={`Ver ${product.brand} ${product.name}`}>
        {imageUrl ? <Image src={imageUrl} alt="" fill sizes={compact ? "72px" : "96px"} className={styles.image} /> : null}
      </Link>
      <div className={styles.info}>
        <span className={styles.brand}>{product.brand}</span>
        <Link href={`/parfums/productos/${product.slug}` as Route} className={styles.name}>{product.name}</Link>
        <span className={styles.variant}>{formatParfumsVariant(line)} · {money(variant.price)}</span>
        <div className={styles.actions}>
          <div className={styles.quantity} aria-label={`Cantidad de ${product.name}`}>
            <button type="button" disabled={quantity <= 1} onClick={() => onQuantity(quantity - 1)} aria-label={`Reducir cantidad de ${product.name}`}>−</button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" disabled={quantity >= 99} onClick={() => onQuantity(quantity + 1)} aria-label={`Aumentar cantidad de ${product.name}`}>+</button>
          </div>
          <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Eliminar ${product.name} del carrito`}>Eliminar</button>
        </div>
      </div>
      <strong className={styles.subtotal}>{money(subtotal)}</strong>
    </article>
  );
}
