import { campaignProductsHref } from "./campaign-presentation";

// Human presentation of the blocker codes emitted by
// admin_list_import_publication_blockers (20260920050000). Counts are never
// computed here — they come from that RPC's own total_count per p_blocker
// filter, so a group's number always matches the list it links to.

export type BlockerCode =
  | "offer_unconfirmed"
  | "offer_invalid_price"
  | "offer_invalid_availability"
  | "product_unpublished"
  | "no_active_presentations"
  | "presentation_unpublished"
  | "missing_primary_media"
  | "missing_offer";

type BlockerCopy = {
  label: string;
  one: string;
  many: string;
  why: string;
  actionLabel: string;
  /** Where the owner actually fixes it. */
  resolveHref: (campaignId: string) => string;
};

export function publicationListHref(campaignId: string, blocker?: string): string {
  const params = new URLSearchParams({ campaign: campaignId });
  if (blocker) params.set("blocker", blocker);
  return `/admin/import/publicacion?${params.toString()}#detalle`;
}

const list = (code: BlockerCode) => (campaignId: string) => publicationListHref(campaignId, code);

/** Priority order: what hides the most from customers first. */
export const BLOCKER_PRIORITY: readonly BlockerCode[] = [
  "offer_unconfirmed",
  "offer_invalid_price",
  "offer_invalid_availability",
  "product_unpublished",
  "no_active_presentations",
  "presentation_unpublished",
  "missing_offer",
  "missing_primary_media",
];

const COPY: Record<BlockerCode, BlockerCopy> = {
  offer_unconfirmed: {
    label: "Disponibilidad sin confirmar",
    one: "oferta",
    many: "ofertas",
    why: "Estas ofertas no pueden aparecer en el catálogo hasta que confirmes si están disponibles o agotadas.",
    actionLabel: "Confirmar disponibilidad",
    resolveHref: (campaignId) => campaignProductsHref(campaignId, "unconfirmed"),
  },
  offer_invalid_price: {
    label: "Precio por corregir",
    one: "oferta",
    many: "ofertas",
    why: "Tienen un precio de cero o inválido, así que no se muestran a tus clientes.",
    actionLabel: "Corregir precios",
    resolveHref: list("offer_invalid_price"),
  },
  offer_invalid_availability: {
    label: "Disponibilidad no reconocida",
    one: "oferta",
    many: "ofertas",
    why: "Su disponibilidad no es “Disponible” ni “Agotado”, así que no se muestran.",
    actionLabel: "Revisar ofertas",
    resolveHref: list("offer_invalid_availability"),
  },
  product_unpublished: {
    label: "Producto sin publicar",
    one: "producto",
    many: "productos",
    why: "Un producto en borrador no aparece en el catálogo, aunque tenga precio.",
    actionLabel: "Revisar productos",
    resolveHref: list("product_unpublished"),
  },
  no_active_presentations: {
    label: "Producto sin presentaciones",
    one: "producto",
    many: "productos",
    why: "No tienen ninguna presentación activa, así que no hay nada que ofrecer.",
    actionLabel: "Revisar productos",
    resolveHref: list("no_active_presentations"),
  },
  presentation_unpublished: {
    label: "Presentación sin publicar",
    one: "producto",
    many: "productos",
    why: "Ninguna de sus presentaciones está publicada, así que no se muestran.",
    actionLabel: "Revisar presentaciones",
    resolveHref: list("presentation_unpublished"),
  },
  missing_offer: {
    label: "Sin precio en este consolidado",
    one: "producto",
    many: "productos",
    why: "Están publicados pero no tienen oferta en este consolidado, así que no aparecerán en su catálogo.",
    actionLabel: "Revisar productos",
    resolveHref: list("missing_offer"),
  },
  missing_primary_media: {
    label: "Falta imagen principal",
    one: "producto",
    many: "productos",
    why: "Cada producto necesita una imagen principal para que el consolidado quede listo para abrirse.",
    actionLabel: "Agregar imágenes",
    resolveHref: list("missing_primary_media"),
  },
};

export function isBlockerCode(value: string): value is BlockerCode {
  return (BLOCKER_PRIORITY as readonly string[]).includes(value);
}

/** Human label for a blocker code; never the raw code as primary copy. */
export function blockerLabel(code: string): string {
  return isBlockerCode(code) ? COPY[code].label : "Otro bloqueo";
}

export type BlockerGroup = {
  code: BlockerCode;
  label: string;
  count: number;
  countText: string;
  why: string;
  actionLabel: string;
  href: string;
  listHref: string;
};

export type BlockerSummary = {
  groups: BlockerGroup[];
  /** Codes whose count could not be read — never treated as zero. */
  unverified: BlockerCode[];
  total: number;
};

export function buildBlockerSummary(
  counts: Partial<Record<BlockerCode, number | null>>,
  campaignId: string,
  canEdit: boolean,
): BlockerSummary {
  const groups: BlockerGroup[] = [];
  const unverified: BlockerCode[] = [];
  for (const code of BLOCKER_PRIORITY) {
    if (!(code in counts)) continue;
    const count = counts[code];
    if (count === null || count === undefined) {
      unverified.push(code);
      continue;
    }
    if (count <= 0) continue;
    const copy = COPY[code];
    groups.push({
      code,
      label: copy.label,
      count,
      countText: `${count} ${count === 1 ? copy.one : copy.many}`,
      why: copy.why,
      actionLabel: canEdit ? copy.actionLabel : "Ver detalle",
      href: copy.resolveHref(campaignId),
      listHref: publicationListHref(campaignId, code),
    });
  }
  return { groups, unverified, total: groups.reduce((sum, group) => sum + group.count, 0) };
}

export const BLOCKER_FILTER_OPTIONS: readonly { value: BlockerCode; label: string }[] = BLOCKER_PRIORITY.map((code) => ({
  value: code,
  label: COPY[code].label,
}));
