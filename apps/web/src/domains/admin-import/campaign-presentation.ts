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
    description: "El consolidado fue completado y queda como historial.",
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
  /** Role-independent wording for "Siguiente paso". */
  nextTitle: string;
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

/** The campaign's own products table, optionally pre-filtered by
 * availability — where availability is actually edited (incl. in bulk). */
export function campaignProductsHref(campaignId: string, availability?: "unconfirmed" | "available" | "out_of_stock"): string {
  return `${campaignHref(campaignId)}${availability ? `?disponibilidad=${availability}` : ""}#productos`;
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
    offers = { id: "offers", title: "Productos y precios", nextTitle: "Productos y precios", state: "unknown", detail: "No se pudo verificar en este momento.", href: campaignHref(campaignId), actionLabel: "Ver consolidado" };
  } else if (input.offerCount === 0) {
    offers = { id: "offers", title: "Productos y precios", nextTitle: "Agregar productos y precios", state: "not_started", detail: "Este consolidado todavía no tiene productos con precio.", href: campaignHref(campaignId), actionLabel: view("Agregar productos") };
  } else if (input.invalidPriceCount > 0) {
    offers = { id: "offers", title: "Productos y precios", nextTitle: "Corregir precios", state: "attention", detail: `${plural(input.invalidPriceCount, "oferta tiene", "ofertas tienen")} un precio inválido.`, href: publicationHref(campaignId, "offer_invalid_price"), actionLabel: view("Corregir precios") };
  } else if (input.missingOfferCount > 0) {
    offers = { id: "offers", title: "Productos y precios", nextTitle: "Revisar productos sin oferta", state: "attention", detail: `${plural(input.missingOfferCount, "producto no tiene", "productos no tienen")} oferta en este consolidado.`, href: publicationHref(campaignId, "missing_offer"), actionLabel: view("Revisar productos") };
  } else {
    offers = { id: "offers", title: "Productos y precios", nextTitle: "Productos y precios", state: "complete", detail: `${plural(input.offerCount, "oferta cargada", "ofertas cargadas")} con precio.`, href: campaignHref(campaignId), actionLabel: "Ver consolidado" };
  }

  // 2. Disponibilidad
  let availability: ChecklistStep;
  if (input.offerCount === 0) {
    availability = { id: "availability", title: "Disponibilidad", nextTitle: "Disponibilidad", state: "blocked", detail: "Primero agrega productos con precio al consolidado.", href: null, actionLabel: null };
  } else if (input.unconfirmedOfferCount === null || input.offerCount === null) {
    availability = { id: "availability", title: "Disponibilidad", nextTitle: "Disponibilidad", state: "unknown", detail: "No se pudo verificar en este momento.", href: null, actionLabel: null };
  } else if (input.unconfirmedOfferCount > 0) {
    availability = { id: "availability", title: "Disponibilidad", nextTitle: "Confirmar disponibilidad", state: "attention", detail: `${plural(input.unconfirmedOfferCount, "oferta necesita", "ofertas necesitan")} confirmación de disponibilidad.`, href: campaignProductsHref(campaignId, "unconfirmed"), actionLabel: view("Confirmar disponibilidad") };
  } else {
    availability = { id: "availability", title: "Disponibilidad", nextTitle: "Disponibilidad", state: "complete", detail: "Todas las ofertas tienen disponibilidad confirmada.", href: null, actionLabel: null };
  }

  // 3. Publicación e imágenes
  let publication: ChecklistStep;
  if (input.missingMediaCount === null || input.unpublishedProductCount === null || input.unpublishedPresentationCount === null) {
    publication = { id: "publication", title: "Publicación e imágenes", nextTitle: "Publicación e imágenes", state: "unknown", detail: "No se pudo verificar en este momento.", href: null, actionLabel: null };
  } else {
    const parts: string[] = [];
    if (input.unpublishedProductCount > 0) parts.push(plural(input.unpublishedProductCount, "producto sin publicar", "productos sin publicar"));
    if (input.unpublishedPresentationCount > 0) parts.push(plural(input.unpublishedPresentationCount, "presentación sin publicar", "presentaciones sin publicar"));
    if (input.missingMediaCount > 0) parts.push(plural(input.missingMediaCount, "producto sin imagen principal", "productos sin imagen principal"));
    if (parts.length === 0) {
      publication = { id: "publication", title: "Publicación e imágenes", nextTitle: "Publicación e imágenes", state: "complete", detail: "Productos publicados y con imagen principal.", href: null, actionLabel: null };
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
      publication = { id: "publication", title: "Publicación e imágenes", nextTitle: "Completar publicación e imágenes", state: "attention", detail: `${parts.join(" · ")}.`, href, actionLabel: view("Revisar publicación") };
    }
  }

  // 4. Apertura y cierre (dates are optional in the current authority)
  let schedule: ChecklistStep;
  if (input.closesAt !== null && isPast(input.closesAt, input.now)) {
    schedule = { id: "schedule", title: "Apertura y cierre", nextTitle: "Revisar fechas", state: "attention", detail: `La fecha de cierre (${formatLimaDateTime(input.closesAt)}) ya pasó. Con esa fecha, los clientes no verían el catálogo.`, href: campaignHref(campaignId), actionLabel: view("Revisar fechas") };
  } else if (input.opensAt === null && input.closesAt === null) {
    schedule = { id: "schedule", title: "Apertura y cierre", nextTitle: "Apertura y cierre", state: "not_started", detail: "Sin fechas definidas. Si lo abres así, quedará visible hasta que lo cierres manualmente.", href: campaignHref(campaignId), actionLabel: view("Definir fechas") };
  } else {
    const opens = input.opensAt ? `Apertura: ${formatLimaDateTime(input.opensAt)}` : "Apertura: al abrirlo";
    const closes = input.closesAt ? `Cierre: ${formatLimaDateTime(input.closesAt)}` : "Cierre: manual";
    schedule = { id: "schedule", title: "Apertura y cierre", nextTitle: "Apertura y cierre", state: "complete", detail: `${opens} · ${closes}.`, href: campaignHref(campaignId), actionLabel: "Ver fechas" };
  }

  // 5. Abrir consolidado
  let open: ChecklistStep;
  if (input.status === "open") {
    if (input.isPublicNow === true) {
      open = { id: "open", title: "Abrir consolidado", nextTitle: "Abrir consolidado", state: "complete", detail: "Abierto y visible para tus clientes.", href: null, actionLabel: null };
    } else if (input.isPublicNow === false) {
      open = { id: "open", title: "Abrir consolidado", nextTitle: "Revisar por qué no es visible", state: "attention", detail: "Está marcado como abierto, pero la tienda no lo muestra a tus clientes.", href: campaignHref(campaignId), actionLabel: "Revisar consolidado" };
    } else {
      open = { id: "open", title: "Abrir consolidado", nextTitle: "Abrir consolidado", state: "unknown", detail: "No se pudo verificar qué ven tus clientes.", href: null, actionLabel: null };
    }
  } else if (input.archived) {
    open = { id: "open", title: "Abrir consolidado", nextTitle: "Abrir consolidado", state: "blocked", detail: "Un consolidado archivado no puede abrirse.", href: null, actionLabel: null };
  } else if (input.readyForManualOpen === null) {
    open = { id: "open", title: "Abrir consolidado", nextTitle: "Abrir consolidado", state: "unknown", detail: "No se pudo verificar si está listo.", href: null, actionLabel: null };
  } else if (!input.readyForManualOpen) {
    open = { id: "open", title: "Abrir consolidado", nextTitle: "Abrir consolidado", state: "blocked", detail: "Completa los pasos anteriores antes de abrirlo.", href: null, actionLabel: null };
  } else {
    open = { id: "open", title: "Abrir consolidado", nextTitle: "Abrir consolidado", state: "attention", detail: "Todo está listo. Al abrirlo, tus clientes podrán enviar solicitudes.", href: campaignHref(campaignId), actionLabel: canEdit ? "Abrir consolidado" : "Ver consolidado" };
  }

  return [offers, availability, publication, schedule, open];
}

export type ImportNextAction = {
  stepId: ChecklistStepId;
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
      return { stepId: step.id, title: step.nextTitle, detail: step.detail, href: step.href, actionLabel: step.actionLabel };
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

// ---------------------------------------------------------------------------
// Phase B1 — consolidado workspace
// ---------------------------------------------------------------------------

export type CustomerView =
  | { kind: "unknown" }
  | { kind: "this"; visibleProducts: number | null }
  | { kind: "other"; number: number; name: string }
  | { kind: "none"; reason: string | null };

/** What customers see right now, from the SAME public selector the
 * storefront uses. `publicCampaign === undefined` means the selector could
 * not be read — reported as unknown, never as "not visible". */
export function deriveCustomerView(input: {
  campaign: { id: string; status: string; opens_at: string | null; closes_at: string | null } | null;
  publicCampaign: { id: string; number: number; name: string } | null | undefined;
  visibleProducts: number | null;
  openCampaignCount: number | null;
  now: Date;
}): CustomerView {
  const { campaign, publicCampaign, now } = input;
  if (publicCampaign === undefined) return { kind: "unknown" };
  if (!campaign) {
    return publicCampaign ? { kind: "other", number: publicCampaign.number, name: publicCampaign.name } : { kind: "none", reason: null };
  }
  if (publicCampaign && publicCampaign.id === campaign.id) return { kind: "this", visibleProducts: input.visibleProducts };
  if (publicCampaign) return { kind: "other", number: publicCampaign.number, name: publicCampaign.name };
  let reason: string | null = null;
  if (campaign.status === "open") {
    if (campaign.opens_at && new Date(campaign.opens_at).getTime() > now.getTime()) {
      reason = `Este consolidado está abierto, pero su apertura está fijada para el ${formatLimaDateTime(campaign.opens_at)}.`;
    } else if (campaign.closes_at && new Date(campaign.closes_at).getTime() <= now.getTime()) {
      reason = "Este consolidado está abierto, pero su fecha de cierre ya pasó.";
    } else if (input.openCampaignCount !== null && input.openCampaignCount > 1) {
      reason = `Hay ${input.openCampaignCount} consolidados abiertos a la vez. La tienda solo muestra uno cuando hay exactamente uno abierto.`;
    }
  }
  return { kind: "none", reason };
}

export type DateWindow = {
  state: "no_dates" | "before_open" | "inside" | "after_close";
  opensLabel: string;
  closesLabel: string;
  /** Plain-language consequence of the dates for THIS status. */
  explanation: string;
};

/** Explains the date window without ever implying that a date changes the
 * status: dates only limit visibility while the status is "Abierto". */
export function campaignDateWindow(input: { status: string; opensAt: string | null; closesAt: string | null; now: Date }): DateWindow {
  const { status, opensAt, closesAt, now } = input;
  const opensLabel = opensAt ? formatLimaDateTime(opensAt) : "Sin fecha — visible desde que lo abras";
  const closesLabel = closesAt ? formatLimaDateTime(closesAt) : "Sin fecha — hasta que lo cierres";
  let state: DateWindow["state"];
  if (!opensAt && !closesAt) state = "no_dates";
  else if (opensAt && new Date(opensAt).getTime() > now.getTime()) state = "before_open";
  else if (closesAt && new Date(closesAt).getTime() <= now.getTime()) state = "after_close";
  else state = "inside";

  let explanation: string;
  if (status === "open") {
    explanation =
      state === "before_open"
        ? "Está abierto, pero todavía no llega la fecha de apertura pública: tus clientes aún no lo ven."
        : state === "after_close"
          ? "Está abierto, pero la fecha de cierre ya pasó: tus clientes ya no lo ven. Ciérralo o cambia la fecha."
          : state === "no_dates"
            ? "Está abierto y sin fechas: sigue visible hasta que lo cierres manualmente."
            : "Está abierto y dentro de sus fechas.";
  } else {
    explanation =
      "Las fechas no cambian el estado por sí solas. Solo limitan cuándo lo ven tus clientes mientras el consolidado esté “Abierto”.";
  }
  return { state, opensLabel, closesLabel, explanation };
}

export type LifecycleAction = {
  target: CampaignStatus;
  label: string;
  consequence: string;
  variant: "primary" | "secondary" | "danger";
  /** True when opening although readiness is not confirmed — the UI must
   * warn and ask for an explicit confirmation. There is NO server-side
   * readiness block today; this is a warning, not a guarantee. */
  warnNotReady: boolean;
};

/** Recommended status changes for the current status. Presentation only:
 * every target is a status the existing admin_set_campaign_status RPC
 * already accepts, and the manual control keeps every other option. */
export function recommendedLifecycleActions(input: {
  status: string;
  archived: boolean;
  readyForManualOpen: boolean | null;
}): LifecycleAction[] {
  if (input.archived || !isCampaignStatus(input.status)) return [];
  const open = (label: string): LifecycleAction => ({
    target: "open",
    label,
    consequence: `${campaignStatusPresentation("open").publicConsequence} Revisa las fechas de apertura y cierre antes de abrirlo.`,
    variant: input.readyForManualOpen === true ? "primary" : "secondary",
    warnNotReady: input.readyForManualOpen !== true,
  });
  const pause: LifecycleAction = {
    target: "paused",
    label: "Pausar consolidado",
    consequence: `${campaignStatusPresentation("paused").publicConsequence} Podrás reanudarlo después.`,
    variant: "secondary",
    warnNotReady: false,
  };
  const close: LifecycleAction = {
    target: "closed",
    label: "Cerrar solicitudes",
    consequence: `${campaignStatusPresentation("closed").publicConsequence} Los pedidos ya recibidos no cambian.`,
    variant: "danger",
    warnNotReady: false,
  };
  switch (input.status) {
    case "draft":
    case "scheduled":
      return [open("Abrir consolidado")];
    case "open":
      return [pause, close];
    case "paused":
      return [open("Reanudar consolidado"), close];
    case "closed":
      return [
        {
          target: "fulfilled",
          label: "Marcar como completado",
          consequence: "Úsalo cuando todos los pedidos de este consolidado estén atendidos. Queda como historial.",
          variant: "secondary",
          warnNotReady: false,
        },
      ];
    default:
      return [];
  }
}
