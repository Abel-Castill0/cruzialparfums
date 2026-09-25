import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import { COMPLAINT_DOCUMENT_LABELS, COMPLAINT_TYPE_LABELS } from "@/domains/complaints/complaint-schema";
import { ComplaintStatusForm } from "./complaint-status-form";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Detalle de reclamo" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });
}

export default async function AdminParfumsComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className={styles.page}><main><p className={styles.notice}>El backend de administración no está configurado.</p></main></div>;
  }

  const repository = new AdminComplaintsRepository(supabase, membership.businessUnitId);
  const entryResult = await repository.getById(id);
  if (!entryResult.ok) {
    if (entryResult.error.type === "not_found") notFound();
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudo cargar el reclamo.</p></main></div>;
  }

  const entry = entryResult.data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{COMPLAINT_TYPE_LABELS[entry.complaintType]}</h1>
          <p>Registrado el {formatDate(entry.createdAt)}</p>
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={styles.sectionTitle}><h2>Consumidor</h2></div>
          <dl className={styles.rowStats}>
            <div><dt>Nombre</dt><dd>{entry.fullName}</dd></div>
            <div><dt>Documento</dt><dd>{COMPLAINT_DOCUMENT_LABELS[entry.documentType]} {entry.documentNumber}</dd></div>
            <div><dt>Dirección</dt><dd>{entry.address}</dd></div>
            <div><dt>Teléfono</dt><dd>{entry.phone}</dd></div>
            <div><dt>Correo</dt><dd>{entry.email}</dd></div>
            {entry.isMinor ? (
              <div><dt>Apoderado</dt><dd>{entry.guardianFullName} — {entry.guardianDocumentNumber}</dd></div>
            ) : null}
            {entry.orderReference ? <div><dt>Referencia de pedido</dt><dd>{entry.orderReference}</dd></div> : null}
          </dl>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><h2>Detalle</h2></div>
          <p>{entry.detail}</p>
          <div className={styles.sectionTitle}><h2>Solución solicitada</h2></div>
          <p>{entry.consumerRequest}</p>
        </section>

        <ComplaintStatusForm
          id={entry.id}
          expectedUpdatedAt={entry.updatedAt}
          currentStatus={entry.status}
          currentNotes={entry.adminNotes ?? ""}
        />
      </main>
    </div>
  );
}
