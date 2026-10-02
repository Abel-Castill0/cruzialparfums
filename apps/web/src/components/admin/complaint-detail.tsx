import type { ComplaintEntry } from "@/domains/complaints/complaint-repository";
import { COMPLAINT_DOCUMENT_LABELS, COMPLAINT_STATUS_LABELS, COMPLAINT_TYPE_LABELS } from "@/domains/complaints/complaint-schema";
import { COMPLAINT_URGENCY_LABELS } from "@/domains/complaints/sla";
import {
  classifyComplaintUrgency,
  complaintStatusTone,
  complaintUrgencyTone,
  formatComplaintDateLong,
} from "@/domains/complaints/complaint-presentation";
import { AdminPage, AdminPageHeader, BackLink, Disclosure, FactList, StatusBadge } from "./admin-ui";
import { ComplaintStatusPanel, type UpdateComplaintStatusResult } from "./complaint-status-panel";
import catalogStyles from "./catalog-workspace.module.css";

export type ComplaintDetailProps = {
  unitName: string;
  basePath: string;
  canWrite: boolean;
  entry: ComplaintEntry;
  updateStatus: (id: string, expectedUpdatedAt: string, newStatus: string, adminNotes: string) => Promise<UpdateComplaintStatusResult>;
};

/** Shared complaint detail workspace for Parfums and Import: the customer's
 * own submission first (legally the evidence of record — never reworded),
 * then the case's current state and the one next action. */
export function ComplaintDetail({ unitName, basePath, canWrite, entry, updateStatus }: ComplaintDetailProps) {
  const urgency = classifyComplaintUrgency(entry);
  const resolved = entry.status === "resolved";

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={unitName}
        title={COMPLAINT_TYPE_LABELS[entry.complaintType]}
        description={`Registrado el ${formatComplaintDateLong(entry.createdAt)} por ${entry.fullName}.`}
      />

      <div className={catalogStyles.summary}>
        <div className={catalogStyles.summaryMain}>
          <p className={catalogStyles.eyebrow}>Estado del caso</p>
          <div className={catalogStyles.headerBadges}>
            <StatusBadge tone={complaintStatusTone(entry.status)}>{COMPLAINT_STATUS_LABELS[entry.status]}</StatusBadge>
            {!resolved ? <StatusBadge tone={complaintUrgencyTone(urgency)}>{COMPLAINT_URGENCY_LABELS[urgency]}</StatusBadge> : null}
          </div>
          {/* Resolved cases never show a response deadline as if it were
           * still current — that would read as a pending obligation the
           * owner already met. Prefer the authoritative resolvedAt; the
           * database guarantees it is set whenever status is "resolved"
           * (complaint_book_entries_resolved_provenance_check), but this
           * never fabricates a timestamp if it were somehow missing. */}
          <p className={catalogStyles.consequence}>
            {resolved
              ? entry.resolvedAt
                ? `Resuelto el ${formatComplaintDateLong(entry.resolvedAt)} (hora de Lima).`
                : "Este reclamo está marcado como resuelto."
              : `${COMPLAINT_URGENCY_LABELS[urgency]} · Responder hasta ${formatComplaintDateLong(entry.dueAt)} (hora de Lima).`}
          </p>
        </div>
        <div className={catalogStyles.summaryNext}>
          <p className={catalogStyles.eyebrow}>Siguiente paso</p>
          {resolved ? (
            <p className={catalogStyles.consequence}>
              No requiere acción. Puedes reabrir el caso más abajo si hace falta revisarlo de nuevo.
            </p>
          ) : null}
          <ComplaintStatusPanel
            id={entry.id}
            expectedUpdatedAt={entry.updatedAt}
            currentStatus={entry.status}
            currentNotes={entry.adminNotes ?? ""}
            canWrite={canWrite}
            updateStatus={updateStatus}
          />
        </div>
      </div>

      <section className={catalogStyles.card} aria-labelledby="complaint-consumer-title">
        <div className={catalogStyles.cardHead}>
          <h2 id="complaint-consumer-title" className={catalogStyles.cardTitle}>Quién reclama</h2>
        </div>
        <FactList
          items={[
            { term: "Nombre", value: entry.fullName },
            { term: "Documento", value: `${COMPLAINT_DOCUMENT_LABELS[entry.documentType]} ${entry.documentNumber}` },
            { term: "Dirección", value: entry.address },
            { term: "Teléfono", value: entry.phone },
            { term: "Correo", value: entry.email },
            ...(entry.isMinor ? [{ term: "Apoderado", value: `${entry.guardianFullName} — ${entry.guardianDocumentNumber}` }] : []),
            ...(entry.orderReference ? [{ term: "Referencia de pedido", value: entry.orderReference }] : []),
          ]}
        />
      </section>

      <section className={catalogStyles.card} aria-labelledby="complaint-request-title">
        <div className={catalogStyles.cardHead}>
          <h2 id="complaint-request-title" className={catalogStyles.cardTitle}>Qué pide el cliente</h2>
        </div>
        <p className={catalogStyles.muted}>
          Texto enviado por el cliente — es la evidencia del caso; no se reescribe desde este panel.
        </p>
        <FactList
          items={[
            { term: "Detalle del reclamo", value: <span style={{ whiteSpace: "pre-wrap" }}>{entry.detail}</span> },
            { term: "Solución solicitada", value: <span style={{ whiteSpace: "pre-wrap" }}>{entry.consumerRequest}</span> },
          ]}
        />
      </section>

      <Disclosure summary="Detalles técnicos" hint="ID, referencia y fechas exactas">
        <FactList
          items={[
            { term: "ID interno", value: entry.id },
            { term: "Referencia (request ID)", value: entry.requestId },
            { term: "Creado", value: formatComplaintDateLong(entry.createdAt) },
            { term: "Última actualización", value: formatComplaintDateLong(entry.updatedAt) },
            { term: "Resuelto", value: entry.resolvedAt ? formatComplaintDateLong(entry.resolvedAt) : "Aún no" },
          ]}
        />
      </Disclosure>

      <BackLink href={basePath}>Volver a Libro de Reclamaciones</BackLink>
    </AdminPage>
  );
}
