/**
 * The photographs of the three curated sets, exactly as supplied. They live in
 * the "Sets Cruzial" surfaces (home carousel and the sets page), never in the
 * hero. A photograph stored with the set itself (admin media) always wins;
 * these apply only when the set has none. Keyed by the set's slug.
 */
export type ComboArt = {
  src: string;
  alt: string;
  /** Focal point on wide screens and on tall, narrow crops. */
  position: string;
  mobilePosition: string;
};

export const COMBO_ART: Readonly<Record<string, ComboArt>> = {
  "combo-cuarteto": {
    src: "/parfums/hero/promo-cuarteto.webp",
    alt: "Composición del Cuarteto Oriental con sus frascos y cajas sobre una superficie de mármol",
    position: "64% 50%",
    mobilePosition: "78% 50%",
  },
  "combo-vainilla": {
    src: "/parfums/hero/promo-vainilla.webp",
    alt: "Composición de Vainilla Freak con frascos rosados, vainilla y flores",
    position: "62% 50%",
    mobilePosition: "78% 50%",
  },
  "combo-tulum": {
    src: "/parfums/hero/promo-tulum.webp",
    alt: "Composición del set Tulum con fragancias verdes y cítricos junto al mar",
    position: "64% 50%",
    mobilePosition: "72% 50%",
  },
};

/** Original client supplied set artwork from the legacy combo catalog. */
export const COMBO_SET_ART: Readonly<Record<string, ComboArt>> = {
  "combo-cuarteto": {
    src: "/parfums/combos/set-cuarteto.webp",
    alt: "Arte original del set Cuarteto Oriental con sus cuatro fragancias Lattafa",
    position: "50% 50%",
    mobilePosition: "50% 50%",
  },
  "combo-vainilla": {
    src: "/parfums/combos/set-vainilla.webp",
    alt: "Arte original del set Vainilla Freak con sus fragancias",
    position: "50% 50%",
    mobilePosition: "50% 50%",
  },
  "combo-tulum": {
    src: "/parfums/combos/set-tulum.webp",
    alt: "Arte original del set Tulum con sus fragancias",
    position: "50% 50%",
    mobilePosition: "50% 50%",
  },
};
