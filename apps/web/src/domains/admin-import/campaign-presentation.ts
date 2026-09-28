import { campaignStatusLabel, isCampaignStatus, type CampaignStatus } from "./campaign-schema";

// Presentation-only interpretation of Import campaign state for the owner.
// It never decides authority: public visibility is whatever
// public_get_import_current_campaign() returns, and readiness is whatever
// admin_get_import_publication_readiness() / the blocker list RPC return.
// Unknown inputs (null) are reported as unverified, never as complete.

export type StatusTone = "neutral" | "healthy" | "attention" | "danger";

export type CampaignStatusPresentation = {
  label: string;
  description: string;
  publicConsequence: string;
  tone: StatusTone;
};

const STATUS_PRESENTATION: Record<CampaignStatus, Omit<CampaignStatusPresentation, "label">> = {
  draft: {
    description: "Estás preparando este consolidado.",
    publicConsequence: "El catálogo todavía no es visible para tus clientes.",
    tone: "neutral",
  },
  scheduled: {
    description: "Marcado como programado. Este estado no abre el consolidado automáticamente.",
    publicConsequence: "Tus clientes todavía no lo ven. Solo será visible cuando lo marques como abierto.",
    tone: "neutral",
  },
  open: {
    description: "El consolidado está abierto.",
    publicConsequence: "Los clientes pueden realizar solicitudes de este consolidado mientras esté dentro de sus fechas.",
    tone: "healthy",
  },
  paused: {
    description: "Pausaste el consolidado.",
    publicConsequence: "Tus clientes no ven el catálogo ni pueden enviar nuevas solicitudes.",
    tone: "attention",
  },
  closed: {
    description: "El consolidado está cerrado.",
    publicConsequence: "Ya no se aceptan nuevas solicitudes.",
    tone: "neutral",
  },
  fulfilled: {
    description: "El consolidado fue completado.",
    publicConsequence: "Ya no se aceptan nuevas solicitudes.",
    tone: "neutral",
  },
};

export function campaignStatusPresentation(status: string): CampaignStatusPresentation {
  if (!isCampaignStatus(status)) {
    return {
      label: "Estado desconocido",
      description: "No se pudo interpretar el estado de este consolidado.",
      publicConsequence: "Revisa el consolidado antes de continuar.",
      tone: "attention",
    };
  }
  return { label: campaignStatusLabel(status), ...STATUS_PRESENTATION[status] };
}

export type ChecklistState = "complete" | "attention" | "not_started" | "blocked" | "unknown";

export type ChecklistStepId = "offers" | "availability" | "publication" | "schedule" | "open";

export type ChecklistStep = {
  id: ChecklistStepId;
  title: string;
  state: ChecklistState;
  detail: string;
  href: string | null;
  actionLabel: string | null;
};

export type ImportReadinessInput = {
  campaignId: string;
  status: string;
  archived: boolean;
  opensAt: string | null;
  closesAt: string | null;
  now: Date;
  /** Offers (campaign_products rows) in this campaign; null = could not read. */
  offerCount: number | null;
  /** Products with active presentations but no offer (blocker list RPC). */
  missingOfferCount: number | null;
  invalidPriceCount: number | null;
  unconfirmedOfferCount: number | null;
  missingMediaCount: number | null;
  unpublishedProductCount: number | null;
  unpublishedPresentationCount: number | null;
  /** readiness.ready_for_manual_open; null = could not read. */
  readyForManualOpen: boolean | null;
  /** True when the public selector currently returns THIS campaign. */
  isPublicNow: boolean | null;
  canEdit: boolean;
};

const PREPARING_STATUSES = new Set(["draft", "scheduled", "paused", "open"]);

export function isPreparationRelevant(status: string): boolean {
  return PREPARING_STATUSES.has(status);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function publicationHref(campaignId: string, blocker: string): string {
  return `/admin/import/publicacion?blocker=${blocker}&campaign=${campaignId}`;
}

function campaignHref(campaignId: string): string {
  return `/admin/import/consolidados/${campaignId}`;
}

const LIMA_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: "America/Lima",
  dateStyle: "medium",
  timeStyle: "short",
};

export function formatLimaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", LIMA_FORMAT);
}

function isPast(iso: string | null, now: Date): boolean {
  return iso !== null && new Date(iso).getTime() <= now.getTime();
}

export function buildImportChecklist(input: ImportReadinessInput): ChecklistStep[] {
  const { campaignId, canEdit } = input;
  const view = (editLabel: string) => (canEdit ? editLabel : "Ver detalle");

  // 1. Productos y precios
  let offers: ChecklistStep;
  if (input.offerCount === null || input.missingOfferCount === null || input.invalidPriceCount === null) {
    offers = { id: "offers", title: "Productos y precios", state: "unknown", detail: "No se pudo verificar en este momento.", href: campaignHref(campaignId), actionLabel: "Ver consolidado" };
  } else if (input.offerCount === 0) {
    offers = { id: "offers", title: "Productos y precios", state: "not_started", detail: "Este consolidado todavía no tiene productos con precio.", href: campaignHref(campaignId), actionLabel: view("Agregar productos") };
  } else if (input.invalidPriceCount > 0) {
    offers = { id: "offers", title: "Productos y precios", state: "attention", detail: `${plural(input.invalidPriceCount, "oferta tiene", "ofertas tienen")} un precio inválido.`, href: publicationHref(campaignId, "offer_invalid_price"), actionLabel: view("Corregir precios") };
  } else if (input.missingOfferCount > 0) {
    offers = { id: "offers", title: "Productos y precios", state: "attention", detail: `${plural(input.missingOfferCount, "producto no tiene", "productos no tienen")} oferta en este consolidado.`, href: publicationHref(campaignId, "missing_offer"), actionLabel: view("Revisar productos") };
  } else {
    offers = { id: "offers", title: "Productos y precios", state: "complete", detail: `${plural(input.offerCount, "oferta cargada", "ofertas cargadas")} con precio.`, href: campaignHref(campaignId), actionLabel: "Ver consolidado" };
  }

  // 2. Disponibilidad
  let availability: ChecklistStep;
  if (input.offerCount === 0) {
    availability = { id: "availability", title: "Disponibilidad", state: "blocked", detail: "Primero agrega productos con precio al consolidado.", href: null, actionLabel: null };
  } else if (input.unconfirmedOfferCount === null || input.offerCount === null) {
    availability = { id: "availability", title: "Disponibilidad", state: "unknown", detail: "No se pudo verificar en este momento.", href: null, actionLabel: null };
  } else if (input.unconfirmedOfferCount > 0) {
    availability = { id: "availability", title: "Disponibilidad", state: "attention", detail: `${plural(input.unconfirmedOfferCount, "oferta necesita", "ofertas necesitan")} confirmación de disponibilidad.`, href: publicationHref(campaignId, "offer_unconfirmed"), actionLabel: view("Confirmar disponibilidad") };
  } else {
    availability = { id: "availability", title: "Disponibilidad", state: "complete", detail: "Todas las ofertas tienen disponibilidad confirmada.", href: null, actionLabel: null };
  }

  // 3. Publicación e imágenes
  let publication: ChecklistStep;
  if (input.missingMediaCount === null || input.unpublishedProductCount === null || input.unpublishedPresentationCount === null) {
    publication = { id: "publication", title: "Publicación e imágenes", state: "unknown", detail: "No se pudo verificar en este momento.", href: null, actionLabel: null };
  } else {
    const parts: string[] = [];
    if (input.unpublishedProductCount > 0) parts.push(plural(input.unpublishedProductCount, "producto sin publicar", "productos sin publicar"));
    if (input.unpublishedPresentationCount > 0) parts.push(plural(input.unpublishedPresentationCount, "presentación sin publicar", "presentaciones sin publicar"));
    if (input.missingMediaCount > 0) parts.push(plural(input.missingMediaCount, "producto sin imagen principal", "productos sin imagen principal"));
    if (parts.length === 0) {
      publication = { id: "publication", title: "Publicación e imágenes", state: "complete", detail: "Productos publicados y con imagen principal.", href: null, actionLabel: null };
    } else {
      // A filtered link only when it shows exactly what the detail counts;
      // mixed blockers open the campaign's full blocker list instead.
      const nonZero = ([
        ["product_unpublished", input.unpublishedProductCount],
        ["presentation_unpublished", input.unpublishedPresentationCount],
        ["missing_primary_media", input.missingMediaCount],
      ] as const).filter(([, count]) => count > 0);
      const href = nonZero.length === 1
        ? publicationHref(campaignId, nonZero[0]![0])
        : `/admin/import/publicacion?campaign=${campaignId}`;
      publication = { id: "publication", title: "Publicación e imágenes", state: "attention", detail: `${parts.join(" · ")}.`, href, actionLabel: view("Revisar publicación") };
    }
  }

  // 4. Apertura y cierre (dates are optional in the current authority)
  let schedule: ChecklistStep;
  if (input.closesAt !== null && isPast(input.closesAt, input.now)) {
    schedule = { id: "schedule", title: "Apertura y cierre", state: "attention", detail: `La fecha de cierre (${formatLimaDateTime(input.closesAt)}) ya pasó. Con esa fecha, los clientes no verían el catálogo.`, href: campaignHref(campaignId), actionLabel: view("Revisar fechas") };
  } else if (input.opensAt === null && input.closesAt === null) {
    schedule = { id: "schedule", title: "Apertura y cierre", state: "not_started", detail: "Sin fechas definidas. Si lo abres así, quedará visible hasta que lo cierres manualmente.", href: campaignHref(campaignId), actionLabel: view("Definir fechas") };
  } else {
    const opens = input.opensAt ? `Apertura: ${formatLimaDateTime(input.opensAt)}` : "Apertura: al abrirlo";
    const closes = input.closesAt ? `Cierre: ${formatLimaDateTime(input.closesAt)}` : "Cierre: manual";
    schedule = { id: "schedule", title: "Apertura y cierre", state: "complete", detail: `${opens} · ${closes}.`, href: campaignHref(campaignId), actionLabel: "Ver fechas" };
  }

  // 5. Abrir consolidado
  let open: ChecklistStep;
  if (input.status === "open") {
    if (input.isPublicNow === true) {
      open = { id: "open", title: "Abrir consolidado", state: "complete", detail: "Abierto y visible para tus clientes.", href: null, actionLabel: null };
    } else if (input.isPublicNow === false) {
      open = { id: "open", title: "Abrir consolidado", state: "attention", detail: "Está marcado como abierto, pero la tienda no lo muestra a tus clientes.", href: campaignHref(campaignId), actionLabel: "Revisar consolidado" };
    } else {
      open = { id: "open", title: "Abrir consolidado", state: "unknown", detail: "No se pudo verificar qué ven tus clientes.", href: null, actionLabel: null };
    }
  } else if (input.archived) {
    open = { id: "open", title: "Abrir consolidado", state: "blocked", detail: "Un consolidado archivado no puede abrirse.", href: null, actionLabel: null };
  } else if (input.readyForManualOpen === null) {
    open = { id: "open", title: "Abrir consolidado", state: "unknown", detail: "No se pudo verificar si está listo.", href: null, actionLabel: null };
  } else if (!input.readyForManualOpen) {
    open = { id: "open", title: "Abrir consolidado", state: "blocked", detail: "Completa los pasos anteriores antes de abrirlo.", href: null, actionLabel: null };
  } else {
    open = { id: "open", title: "Abrir consolidado", state: "attention", detail: "Todo está listo. Al abrirlo, tus clientes podrán enviar solicitudes.", href: campaignHref(campaignId), actionLabel: canEdit ? "Abrir consolidado" : "Ver consolidado" };
  }

  return [offers, availability, publication, schedule, open];
}

export type ImportNextAction = {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

/**
 * The single most important next step, derived from the checklist in its
 * fixed dependency order. Returns null when nothing is pending or the
 * required facts could not be verified (never a guessed step).
 */
export function selectImportNextAction(steps: readonly ChecklistStep[]): ImportNextAction | null {
  for (const step of steps) {
    if (step.state === "unknown") return null;
    if ((step.state === "attention" || step.state === "not_started") && step.href && step.actionLabel) {
      // Undated campaigns are valid in the current authority; missing dates
      // alone never outrank a real blocker, and are not a "next action".
      if (step.id === "schedule" && step.state === "not_started") continue;
      return { title: step.actionLabel, detail: step.detail, href: step.href, actionLabel: step.actionLabel };
    }
  }
  return null;
}

export const CHECKLIST_STATE_LABELS: Record<ChecklistState, string> = {
  complete: "Completo",
  attention: "Requiere atención",
  not_started: "Sin empezar",
  blocked: "Aún no disponible",
  unknown: "Sin verificar",
};
