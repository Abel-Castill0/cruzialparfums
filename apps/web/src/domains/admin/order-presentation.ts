import { allowedParfumsOrderTransitions, orderStatusLabel } from "@/domains/admin-parfums/order-status";
import { allowedImportOrderTransitions, importOrderStatusLabel } from "@/domains/admin-import/import-status";

// Presentation-only interpretation of an order's stored status for the
// owner. It never decides authority: valid transitions come from each unit's
// existing transition helper (mirrors of the RPC matrix), and the RPC stays
// the final judge of every change. Unknown statuses are reported honestly
// and never given a guessed next step.

export type OrderUnit = "parfums" | "import";
export type OrderTone = "neutral" | "healthy" | "attention" | "danger";

export const LIMA_TIME_ZONE = "America/Lima";

const KNOWN_STATUSES = ["pending_whatsapp_confirmation", "confirmed", "fulfilled", "cancelled"] as const;
type KnownStatus = (typeof KNOWN_STATUSES)[number];

function isKnownStatus(status: string): status is KnownStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(status);
}

export type OrderStatusPresentation = {
  label: string;
  tone: OrderTone;
  /** Short human line for the list: what is happening / what is missing. */
  situation: string | null;
};

const TONES: Record<KnownStatus, OrderTone> = {
  pending_whatsapp_confirmation: "attention",
  confirmed: "neutral",
  fulfilled: "healthy",
  cancelled: "neutral",
};

const SITUATIONS: Record<OrderUnit, Record<KnownStatus, string>> = {
  parfums: {
    pending_whatsapp_confirmation: "Esperando confirmación por WhatsApp",
    confirmed: "Pedido confirmado — falta completarlo",
    fulfilled: "Pedido completado",
    cancelled: "Pedido cancelado",
  },
  import: {
    pending_whatsapp_confirmation: "Esperando coordinación por WhatsApp",
    confirmed: "Coordinación confirmada — falta completarlo",
    fulfilled: "Pedido completado",
    cancelled: "Pedido cancelado",
  },
};

export function orderStatusPresentation(unit: OrderUnit, status: string): OrderStatusPresentation {
  const label = unit === "parfums" ? orderStatusLabel(status) : importOrderStatusLabel(status);
  if (!isKnownStatus(status)) return { label, tone: "attention", situation: null };
  return { label, tone: TONES[status], situation: SITUATIONS[unit][status] };
}

export function allowedOrderTransitions(unit: OrderUnit, status: string): string[] {
  return unit === "parfums" ? allowedParfumsOrderTransitions(status) : allowedImportOrderTransitions(status);
}

// ---------------------------------------------------------------------------
// List filters — owner vocabulary over the EXISTING stored statuses. The URL
// keeps the stored value (?status=pending_whatsapp_confirmation) so Action
// Center / dashboard deep links keep working.
// ---------------------------------------------------------------------------

export type OrderFilterTab = {
  key: string;
  label: string;
  /** Stored status value, or "" for "Todos". */
  status: string;
};

export const ORDER_FILTER_TABS: readonly OrderFilterTab[] = [
  { key: "attention", label: "Necesitan atención", status: "pending_whatsapp_confirmation" },
  { key: "confirmed", label: "Confirmados", status: "confirmed" },
  { key: "fulfilled", label: "Completados", status: "fulfilled" },
  { key: "cancelled", label: "Cancelados", status: "cancelled" },
  { key: "all", label: "Todos", status: "" },
];

export function isOrderFilterStatus(value: string): boolean {
  return ORDER_FILTER_TABS.some((tab) => tab.status !== "" && tab.status === value);
}

/** Builds a list href that keeps search/age, swaps status and resets page. */
export function orderListHref(
  basePath: string,
  current: { search: string; age: string },
  status: string,
): string {
  const params = new URLSearchParams();
  if (current.search) params.set("q", current.search);
  if (status) params.set("status", status);
  if (current.age) params.set("age", current.age);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function emptyOrdersMessage(status: string, filtered: boolean): { title: string; detail: string | null } {
  if (filtered) {
    return {
      title: "No hay pedidos que coincidan con esta búsqueda.",
      detail: "Prueba con otro nombre, número o teléfono, o quita el filtro de antigüedad.",
    };
  }
  switch (status) {
    case "pending_whatsapp_confirmation":
      return { title: "No hay pedidos que necesiten atención.", detail: "Cuando llegue una nueva solicitud aparecerá aquí." };
    case "confirmed":
      return { title: "No hay pedidos confirmados por completar.", detail: null };
    case "fulfilled":
      return { title: "Todavía no hay pedidos completados.", detail: null };
    case "cancelled":
      return { title: "No hay pedidos cancelados.", detail: null };
    default:
      return { title: "No hay pedidos registrados todavía.", detail: "Las solicitudes de tus clientes aparecerán aquí." };
  }
}

// ---------------------------------------------------------------------------
// Actions — copy only. Which actions exist is decided by
// allowedOrderTransitions(); this only says what each one means.
// ---------------------------------------------------------------------------

export type OrderActionCopy = {
  label: string;
  consequence: string;
  variant: "primary" | "danger";
};

const INVENTORY_NOTE_FULFILL = "Si el pedido reservó unidades de inventario, se descuentan del stock.";
const INVENTORY_NOTE_CANCEL = "Si el pedido reservó unidades de inventario, se liberan.";
const NOTIFICATION_NOTE = "Se registra un aviso para el cliente; su envío depende de la configuración de WhatsApp.";

export function orderActionCopy(unit: OrderUnit, target: string): OrderActionCopy | null {
  switch (target) {
    case "confirmed":
      return unit === "parfums"
        ? {
            label: "Confirmar por WhatsApp",
            consequence: `Úsalo cuando el cliente ya confirmó el pedido por WhatsApp. El pedido pasa a “Confirmado”. ${NOTIFICATION_NOTE}`,
            variant: "primary",
          }
        : {
            label: "Confirmar coordinación",
            consequence: `Úsalo cuando ya coordinaste el pedido con el cliente por WhatsApp. El pedido pasa a “Coordinación confirmada”. ${NOTIFICATION_NOTE}`,
            variant: "primary",
          };
    case "fulfilled":
      return {
        label: "Marcar como completado",
        consequence: `Úsalo cuando el pedido ya fue entregado o atendido. Es el paso final y no se puede deshacer. ${INVENTORY_NOTE_FULFILL} ${NOTIFICATION_NOTE}`,
        variant: "primary",
      };
    case "cancelled":
      return {
        label: "Cancelar pedido",
        consequence: `La cancelación es definitiva: el pedido no podrá reactivarse. ${INVENTORY_NOTE_CANCEL} ${NOTIFICATION_NOTE}`,
        variant: "danger",
      };
    default:
      return null;
  }
}

export type OrderNextStep = {
  title: string;
  detail: string;
  tone: OrderTone;
  /** The transition to offer as the single primary action, if any. */
  primaryTarget: string | null;
  /** Lower-weight transitions (e.g. cancel). */
  secondaryTargets: string[];
};

/** Derives the next operational step from the existing transition helper.
 * Returns null for an unknown status — never a guessed step. */
export function orderNextStep(unit: OrderUnit, status: string): OrderNextStep | null {
  if (!isKnownStatus(status)) return null;
  const transitions = allowedOrderTransitions(unit, status);
  const primaryTarget = transitions.find((target) => target !== "cancelled") ?? null;
  const secondaryTargets = transitions.filter((target) => target !== primaryTarget);
  switch (status) {
    case "pending_whatsapp_confirmation":
      return {
        title: unit === "parfums" ? "Confirmar el pedido con el cliente" : "Coordinar el pedido con el cliente",
        detail:
          unit === "parfums"
            ? "Escribe al cliente por WhatsApp. Cuando confirme, registra la confirmación aquí."
            : "Escribe al cliente por WhatsApp para coordinar el pedido y el depósito. Cuando esté coordinado, regístralo aquí.",
        tone: "attention",
        primaryTarget,
        secondaryTargets,
      };
    case "confirmed":
      return {
        title: "Completar el pedido",
        detail: "Cuando el pedido haya sido entregado o atendido, márcalo como completado.",
        tone: "neutral",
        primaryTarget,
        secondaryTargets,
      };
    case "fulfilled":
      return {
        title: "Pedido completado",
        detail: "No hay acciones pendientes. El pedido queda como historial.",
        tone: "healthy",
        primaryTarget: null,
        secondaryTargets: [],
      };
    case "cancelled":
      return {
        title: "Pedido cancelado",
        detail: "No hay acciones pendientes. Un pedido cancelado no puede reactivarse.",
        tone: "neutral",
        primaryTarget: null,
        secondaryTargets: [],
      };
  }
}

// ---------------------------------------------------------------------------
// Progression — only marks a step done when the stored status (or recorded
// status events) prove it. A cancellation is a terminal branch, never shown
// as if the order passed every step.
// ---------------------------------------------------------------------------

export type OrderStatusEvent = {
  fromStatus: string | null;
  toStatus: string;
  occurredAt: string;
};

export type OrderProgressStep = {
  key: string;
  title: string;
  detail?: string;
  state: "done" | "current" | "upcoming" | "stopped";
};

function lastEventTo(events: readonly OrderStatusEvent[] | null, status: string): OrderStatusEvent | null {
  if (!events) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]!.toStatus === status) return events[i]!;
  }
  return null;
}

export function buildOrderProgress(input: {
  unit: OrderUnit;
  status: string;
  createdAt: string;
  events: readonly OrderStatusEvent[] | null;
}): OrderProgressStep[] | null {
  const { unit, status, createdAt, events } = input;
  if (!isKnownStatus(status)) return null;

  const at = (event: OrderStatusEvent | null): { detail?: string } =>
    event ? { detail: formatLimaDateTime(event.occurredAt) } : {};
  const received: OrderProgressStep = {
    key: "received",
    title: "Solicitud recibida",
    detail: formatLimaDateTime(createdAt),
    state: "done",
  };
  const confirmTitle = unit === "parfums" ? "Confirmación por WhatsApp" : "Coordinación por WhatsApp";
  const confirmedEvent = lastEventTo(events, "confirmed");
  const fulfilledEvent = lastEventTo(events, "fulfilled");

  switch (status) {
    case "pending_whatsapp_confirmation":
      return [
        received,
        { key: "confirm", title: confirmTitle, detail: "Esperando al cliente", state: "current" },
        { key: "complete", title: "Completado", state: "upcoming" },
      ];
    case "confirmed":
      return [
        received,
        { key: "confirm", title: "Confirmado", ...at(confirmedEvent), state: "done" },
        { key: "complete", title: "Completado", detail: "Falta completarlo", state: "current" },
      ];
    case "fulfilled":
      return [
        received,
        { key: "confirm", title: "Confirmado", ...at(confirmedEvent), state: "done" },
        { key: "complete", title: "Completado", ...at(fulfilledEvent), state: "done" },
      ];
    case "cancelled": {
      const cancelEvent = lastEventTo(events, "cancelled");
      const cancelled: OrderProgressStep = {
        key: "cancelled",
        title: "Cancelado",
        ...at(cancelEvent),
        state: "stopped",
      };
      if (cancelEvent?.fromStatus === "confirmed") {
        return [
          received,
          { key: "confirm", title: "Confirmado", ...at(confirmedEvent), state: "done" },
          cancelled,
        ];
      }
      if (cancelEvent?.fromStatus === "pending_whatsapp_confirmation") {
        return [received, { ...cancelled, detail: [cancelled.detail, "Antes de confirmarse"].filter(Boolean).join(" · ") }];
      }
      // History unavailable: do not claim whether it was ever confirmed.
      return [received, cancelled];
    }
  }
}

// ---------------------------------------------------------------------------
// Time — always America/Lima, relative for scanning plus absolute for truth.
// ---------------------------------------------------------------------------

const LIMA_DATE_TIME: Intl.DateTimeFormatOptions = {
  timeZone: LIMA_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
};

export function formatLimaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", LIMA_DATE_TIME);
}

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

function limaDayIndex(ms: number): number {
  return Math.floor((ms - LIMA_OFFSET_MS) / 86_400_000);
}

export function formatRelativeLima(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  if (Number.isNaN(then)) return "";
  if (diffMs < 0) return formatLimaDateTime(iso);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} min`;
  const dayDiff = limaDayIndex(now.getTime()) - limaDayIndex(then);
  if (dayDiff === 0) return `Hace ${Math.floor(minutes / 60)} h`;
  if (dayDiff === 1) return "Ayer";
  if (dayDiff < 7) return `Hace ${dayDiff} días`;
  return new Date(iso).toLocaleDateString("es-PE", { timeZone: LIMA_TIME_ZONE, dateStyle: "medium" });
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
}
