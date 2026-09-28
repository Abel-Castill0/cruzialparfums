import type { ImportProductDetail } from "./catalog-repository";
import { classifyProductReadiness, type ImportProductStatus, type ProductReadiness } from "./catalog-schema";
import { campaignProductsHref } from "./campaign-presentation";

// Presentation-only helpers for the Import product list/workspace. Readiness
// always comes from classifyProductReadiness (the same function the list
// uses); list views map 1:1 onto existing admin_list_import_products filter
// predicates. Nothing here decides authority.

export type ImportListView = {
  key: string;
  label: string;
  params: { status?: string; offer?: string; media?: string };
};

/** Only views that map EXACTLY to an existing list predicate. There is no
 * list predicate for "availability unconfirmed", so that is surfaced as a
 * campaign count linking to the consolidado products table instead. */
export const IMPORT_LIST_VIEWS: readonly ImportListView[] = [
  { key: "all", label: "Todos", params: {} },
  { key: "without_offer", label: "Sin oferta en este consolidado", params: { offer: "without_offer" } },
  { key: "without_primary", label: "Sin imagen principal", params: { media: "without_primary" } },
  { key: "without_media", label: "Sin imágenes", params: { media: "without_media" } },
  { key: "draft", label: "Borradores", params: { status: "draft" } },
];

const VIEW_KEYS = ["status", "offer", "media"] as const;

export function currentImportView(params: Record<string, string>): string | null {
  const view = IMPORT_LIST_VIEWS.find((candidate) =>
    VIEW_KEYS.every((key) => (candidate.params[key] ?? "") === (params[key] ?? "")),
  );
  return view?.key ?? null;
}

export function importViewHref(basePath: string, params: Record<string, string>, view: ImportListView): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || (VIEW_KEYS as readonly string[]).includes(key) || !value) continue;
    next.set(key, value);
  }
  for (const [key, value] of Object.entries(view.params)) if (value) next.set(key, value);
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Filters that stay meaningful after switching consolidado. The `offer`
 * predicate is evaluated against whichever campaign is selected, so it is
 * kept too; only the campaign and the page are reset. */
export function campaignSwitchHiddenParams(params: Record<string, string>): [string, string][] {
  return Object.entries(params).filter(([key, value]) => key !== "campaign" && key !== "page" && value !== "");
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export type ImportProductStep = {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

export type ImportProductAssessment = {
  readiness: ProductReadiness;
  inCatalog: boolean;
  headline: string;
  consequence: string;
  counts: { active: number; published: number; offers: number; unconfirmed: number };
  nextStep: ImportProductStep | null;
};

export function assessImportProduct(
  detail: ImportProductDetail,
  campaign: { id: string; number: number; status: string } | null,
): ImportProductAssessment {
  const active = detail.presentations.filter((presentation) => presentation.archived_at === null);
  const published = active.filter((presentation) => presentation.publication_status === "published");
  const offers = active.filter((presentation) => presentation.offer !== null);
  const unconfirmed = offers.filter((presentation) => presentation.offer?.availability_status === "unconfirmed");
  const readiness = classifyProductReadiness({
    productStatus: detail.product.publication_status as ImportProductStatus,
    archived: detail.product.archived_at !== null,
    activePresentations: active.length,
    publishedPresentations: published.length,
    offerCount: offers.length,
    unconfirmedOfferCount: unconfirmed.length,
    campaignStatus: campaign?.status ?? null,
  });
  const inCatalog = campaign !== null && readiness.publicVisibility === "eligible";

  let headline: string;
  let consequence: string;
  if (!campaign) {
    headline = "Sin consolidado seleccionado";
    consequence = "Elige un consolidado para ver su precio y disponibilidad.";
  } else if (inCatalog) {
    headline = `Visible en el Consolidado #${campaign.number}`;
    consequence = "Este producto puede aparecer en el catálogo de este consolidado.";
  } else {
    headline = `No visible en el Consolidado #${campaign.number}`;
    consequence = "Este producto no aparece en el catálogo de este consolidado hasta resolver lo pendiente.";
  }

  return {
    readiness,
    inCatalog,
    headline,
    consequence,
    counts: { active: active.length, published: published.length, offers: offers.length, unconfirmed: unconfirmed.length },
    nextStep: campaign ? nextStepFor(readiness, campaign, unconfirmed.length) : null,
  };
}

function nextStepFor(
  readiness: ProductReadiness,
  campaign: { id: string; number: number; status: string },
  unconfirmed: number,
): ImportProductStep | null {
  const blockers = readiness.blockers;
  if (blockers.includes("Producto archivado")) return null;
  if (blockers.includes("Producto en borrador") || blockers.includes("Producto oculto")) {
    return { title: "Publicar el producto", detail: "Está en borrador u oculto. Cámbialo a “Publicado” en los datos del producto.", href: "#datos", actionLabel: "Ir a los datos" };
  }
  if (blockers.includes("Sin presentación activa")) {
    return { title: "Agregar una presentación", detail: "El producto no tiene presentaciones activas.", href: "#presentaciones", actionLabel: "Agregar presentación" };
  }
  if (blockers.includes("Sin presentación publicada")) {
    return { title: "Publicar una presentación", detail: "Ninguna presentación está publicada.", href: "#presentaciones", actionLabel: "Revisar presentaciones" };
  }
  if (blockers.includes("Sin oferta en consolidado")) {
    return {
      title: `Agregar precio en el Consolidado #${campaign.number}`,
      detail: "Este producto no tiene oferta en este consolidado. Las ofertas se agregan desde el consolidado.",
      href: `/admin/import/consolidados/${campaign.id}#productos`,
      actionLabel: "Ir al consolidado",
    };
  }
  if (blockers.includes("Disponibilidad sin confirmar")) {
    return {
      title: "Confirmar disponibilidad",
      detail: `${unconfirmed === 1 ? "Una oferta está" : `${unconfirmed} ofertas están`} sin confirmar. Marca si están disponibles o agotadas.`,
      href: "#consolidado",
      actionLabel: "Confirmar disponibilidad",
    };
  }
  if (blockers.includes("Consolidado no abierto")) {
    return {
      title: "El consolidado no está abierto",
      detail: "El producto está listo, pero el catálogo solo se muestra cuando el consolidado está abierto.",
      href: `/admin/import/consolidados/${campaign.id}`,
      actionLabel: "Ver consolidado",
    };
  }
  return null;
}

/** Deep link to confirm availability in bulk for a campaign. */
export function unconfirmedOffersHref(campaignId: string): string {
  return campaignProductsHref(campaignId, "unconfirmed");
}
