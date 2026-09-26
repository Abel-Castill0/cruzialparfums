import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_TYPE_LABELS, isComplaintStatus } from "@/domains/complaints/complaint-schema";
import { COMPLAINT_URGENCY_LABELS, classifyComplaintUrgency, isComplaintUrgency } from "@/domains/complaints/sla";
import { ComplaintFilters } from "./complaint-filters";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Libro de Reclamaciones — Parfums" };

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
}

function statusBadgeClass(status: string): string {
  if (status === "resolved") return [styles.badge, styles["status-published"]].filter(Boolean).join(" ");
  if (status === "received") return [styles.badge, styles["status-draft"]].filter(Boolean).join(" ");
  return styles.badge ?? "";
}

export default async function AdminParfumsComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
    return <div className={styles.page}><main><p className={styles.notice}>El backend de administración no está configurado en este entorno.</p></main></div>;
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const statusParam = typeof params.status === "string" && isComplaintStatus(params.status) ? params.status : undefined;
  const urgency = isComplaintUrgency(params.urgency) ? params.urgency : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const repository = new AdminComplaintsRepository(supabase, membership.businessUnitId);
  const listResult = await repository.list({ search, status: statusParam, urgency }, { page, pageSize: PAGE_SIZE });

  if (!listResult.ok) {
    return <div className={styles.page}><main><p className={styles.notice} role="alert">No se pudieron cargar los reclamos. Intenta de nuevo.</p></main></div>;
  }

  const { items, total, pageSize } = listResult.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Libro de Reclamaciones</h1>
          <p>{total} solicitud{total === 1 ? "" : "es"} registrada{total === 1 ? "" : "s"}.</p>
        </div>
      </header>

      <main>
        <ComplaintFilters initial={{ search, status: statusParam ?? "", urgency: urgency ?? "" }} />

        {items.length === 0 ? (
          <p className={styles.empty}>No hay reclamos ni quejas que coincidan con esta búsqueda.</p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de reclamos">
              {items.map((entry) => (
                <li key={entry.id} className={styles.row}>
                  <Link href={`/admin/parfums/reclamos/${entry.id}` as Route} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>{entry.fullName}</strong>
                      <span className={styles.rowMeta}>{COMPLAINT_TYPE_LABELS[entry.complaintType]}</span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={statusBadgeClass(entry.status)}>{COMPLAINT_STATUS_LABELS[entry.status]}</span>
                    </div>
                    <div className={styles.rowStats}>
                      <span>Registrado: {formatDate(entry.createdAt)}</span>
                      <span>{COMPLAINT_URGENCY_LABELS[classifyComplaintUrgency(entry)]} · Vence: {formatDate(entry.dueAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Paginación">
                {page > 1 ? (
                  <Link href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page - 1) }).toString()}` as Route}>← Anterior</Link>
                ) : <span aria-disabled="true">← Anterior</span>}
                <span>Página {page} de {totalPages}</span>
                {page < totalPages ? (
                  <Link href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page + 1) }).toString()}` as Route}>Siguiente →</Link>
                ) : <span aria-disabled="true">Siguiente →</span>}
              </nav>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
