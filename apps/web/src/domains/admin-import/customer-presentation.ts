import { importCustomerStatusLabel } from "./import-status";

// Presentation-only interpretation of an Import customer. Deposit policy
// resolution mirrors the order RPC (20260920070000): "returning" uses the
// returning policy; "new" AND "pending_verification" both use the "new"
// policy; zero matching active policies makes order creation fail (P2014).
// Percentages always come from deposit_policies — never hardcoded here.

export type CustomerStatus = "pending_verification" | "new" | "returning";
export type CustomerTone = "neutral" | "healthy" | "attention" | "danger";

export type DepositPolicyState = { ok: true; new: number | null; returning: number | null } | { ok: false };

export function isCustomerStatus(value: string): value is CustomerStatus {
  return value === "pending_verification" || value === "new" || value === "returning";
}

export function customerStatusPresentation(status: string): { label: string; tone: CustomerTone; description: string } {
  switch (status) {
    case "pending_verification":
      return { label: importCustomerStatusLabel(status), tone: "attention", description: "Todavía no verificaste a este cliente." };
    case "new":
      return { label: importCustomerStatusLabel(status), tone: "neutral", description: "Cliente verificado como nuevo." };
    case "returning":
      return { label: importCustomerStatusLabel(status), tone: "healthy", description: "Cliente verificado como recurrente." };
    default:
      return { label: importCustomerStatusLabel(status), tone: "attention", description: "No reconocemos este estado. Revísalo antes de registrar pedidos." };
  }
}

/** Which deposit policy the order RPC applies for a stored status. */
export function policyKeyFor(status: string): "new" | "returning" | null {
  if (status === "returning") return "returning";
  if (status === "new" || status === "pending_verification") return "new";
  return null;
}

export type DepositConsequence = {
  tone: CustomerTone;
  title: string;
  detail: string;
};

export function depositConsequence(status: string, policies: DepositPolicyState): DepositConsequence {
  const key = policyKeyFor(status);
  if (!policies.ok) {
    return { tone: "attention", title: "No pudimos verificar la política de depósito", detail: "Recarga la página. No asumas un porcentaje." };
  }
  if (key === null) {
    return { tone: "danger", title: "Estado no reconocido", detail: "El sistema rechazará nuevas solicitudes de este cliente hasta corregir su estado." };
  }
  const percentage = policies[key];
  const policyName = key === "returning" ? "cliente recurrente" : "cliente nuevo";
  if (percentage === null) {
    return {
      tone: "danger",
      title: "No hay una política activa para este estado",
      detail: `Falta una política de depósito vigente para ${policyName}. El sistema no podrá registrar nuevas solicitudes de este cliente hasta configurarla.`,
    };
  }
  const pendingNote = status === "pending_verification" ? " Mientras siga pendiente de verificación se aplica la política de cliente nuevo." : "";
  return {
    tone: "neutral",
    title: `Depósito actual: ${percentage}%`,
    detail: `Con este estado, las nuevas solicitudes usarán actualmente un depósito de ${percentage}% (política de ${policyName}).${pendingNote} Los pedidos ya registrados conservan el porcentaje con el que se crearon.`,
  };
}

export type StatusOption = {
  value: CustomerStatus;
  label: string;
  consequence: string;
};

/** Options for the existing status control, each with its deposit effect. */
export function customerStatusOptions(policies: DepositPolicyState): StatusOption[] {
  const pct = (key: "new" | "returning") =>
    !policies.ok ? "porcentaje sin verificar" : policies[key] === null ? "sin política activa" : `${policies[key]}% de depósito`;
  return [
    { value: "new", label: "Verificar como nuevo", consequence: `Nuevas solicitudes: ${pct("new")}.` },
    { value: "returning", label: "Verificar como recurrente", consequence: `Nuevas solicitudes: ${pct("returning")}.` },
    { value: "pending_verification", label: "Volver a pendiente", consequence: `Nuevas solicitudes: ${pct("new")} (política de cliente nuevo).` },
  ];
}

export const CUSTOMER_STATUS_TABS: readonly { key: string; label: string; status: string }[] = [
  { key: "pending", label: "Pendientes de verificar", status: "pending_verification" },
  { key: "new", label: "Nuevos", status: "new" },
  { key: "returning", label: "Recurrentes", status: "returning" },
  { key: "all", label: "Todos", status: "" },
];

export function customerListHref(basePath: string, params: { q: string; archived: string }, status: string): string {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (status) next.set("status", status);
  if (params.archived && params.archived !== "active") next.set("archived", params.archived);
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}
