import type { AdminTone } from "@/components/admin/admin-ui";
import { type ComplaintStatus, isComplaintStatus } from "./complaint-schema";
import { type ComplaintUrgency, classifyComplaintUrgency } from "./sla";

// Owner-facing presentation over the complaint book's real, stored states.
// Every filter tab and empty message maps to a status the database actually
// holds — nothing here invents or widens legal/business semantics.

export const LIMA_TIME_ZONE = "America/Lima";

export function formatComplaintDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: LIMA_TIME_ZONE });
}

export function formatComplaintDateLong(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short", timeZone: LIMA_TIME_ZONE });
}

const STATUS_TONE: Record<ComplaintStatus, AdminTone> = {
  received: "attention",
  in_review: "neutral",
  resolved: "healthy",
};

export function complaintStatusTone(status: ComplaintStatus): AdminTone {
  return STATUS_TONE[status];
}

const URGENCY_TONE: Record<ComplaintUrgency, AdminTone> = {
  normal: "neutral",
  approaching: "attention",
  overdue: "danger",
  resolved: "healthy",
};

export function complaintUrgencyTone(urgency: ComplaintUrgency): AdminTone {
  return URGENCY_TONE[urgency];
}

export { classifyComplaintUrgency };

export type ComplaintFilterTab = { key: string; label: string; status: ComplaintStatus | "" };

export const COMPLAINT_FILTER_TABS: readonly ComplaintFilterTab[] = [
  { key: "received", label: "Nuevos", status: "received" },
  { key: "in_review", label: "En atención", status: "in_review" },
  { key: "resolved", label: "Resueltos", status: "resolved" },
  { key: "all", label: "Todos", status: "" },
];

export function isComplaintFilterStatus(value: string): value is ComplaintStatus {
  return isComplaintStatus(value);
}

/** Builds a list href that keeps the search term, swaps status and resets page. */
export function complaintListHref(basePath: string, search: string, status: string): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function emptyComplaintsMessage(status: string, filtered: boolean): { title: string; detail: string | null } {
  if (filtered) {
    return {
      title: "No hay reclamos que coincidan con esta búsqueda.",
      detail: "Prueba con otro nombre, teléfono o documento.",
    };
  }
  switch (status) {
    case "received":
      return { title: "No tienes reclamos nuevos.", detail: "Cuando llegue una nueva solicitud aparecerá aquí." };
    case "in_review":
      return { title: "No tienes reclamos en atención.", detail: null };
    case "resolved":
      return { title: "Todavía no hay reclamos resueltos.", detail: null };
    default:
      return { title: "No tienes reclamos pendientes.", detail: "Todo está atendido." };
  }
}
