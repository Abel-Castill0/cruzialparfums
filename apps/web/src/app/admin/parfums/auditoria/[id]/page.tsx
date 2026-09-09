import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsAuditLogRepository } from "@/domains/admin-parfums/audit-log-repository";
import { actionLabel, computeFieldChanges, entityTypeLabel } from "@/domains/admin-parfums/audit-log-schema";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import styles from "../../productos/page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isValidUuid(id) ? "Evento de auditoría" : "Auditoría" };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminParfumsAuditLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice}>El backend de administración no está configurado en este entorno.</p>
        </main>
      </div>
    );
  }

  const repository = new AdminParfumsAuditLogRepository(supabase, "parfums");
  const detailResult = await repository.getById(id);

  if (!detailResult.ok) {
    if (detailResult.error.type === "not_found") notFound();
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudo cargar el evento de auditoría.</p>
        </main>
      </div>
    );
  }

  const entry = detailResult.data;
  // Bounded, curated diff — never the raw before/after JSON. See
  // computeFieldChanges: sensitive key names are redacted outright and the
  // list is capped, regardless of what a future entity/field turns out to
  // hold.
  const { changes, truncated } = computeFieldChanges(entry.before, entry.after);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/parfums/auditoria" className={styles.back}>← Auditoría</Link>
          <h1>{actionLabel(entry.action)} · {entityTypeLabel(entry.entityType)}</h1>
          <p>{formatDateTime(entry.createdAt)}</p>
        </div>
      </header>

      <main className={styles.formWrapper}>
        <section className={styles.section} aria-labelledby="event-heading">
          <div className={styles.sectionTitle}>
            <h2 id="event-heading">Evento</h2>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Fecha</dt><dd>{formatDateTime(entry.createdAt)}</dd></div>
            <div><dt>Actor</dt><dd>{entry.actorEmail ?? "Actor no disponible"}</dd></div>
            <div><dt>Acción</dt><dd><span className={styles.badge}>{actionLabel(entry.action)}</span></dd></div>
            <div><dt>Entidad</dt><dd><span className={styles.badge}>{entityTypeLabel(entry.entityType)}</span></dd></div>
          </dl>
          {/* Internal identifiers for troubleshooting only. */}
          <p className={styles.rowMeta}>
            ID del evento: {entry.id}
            {entry.entityId ? ` · ID de la entidad: ${entry.entityId}` : ""}
          </p>
        </section>

        <section className={styles.section} aria-labelledby="changes-heading">
          <div className={styles.sectionTitle}>
            <h2 id="changes-heading">Cambios ({changes.length})</h2>
          </div>
          {changes.length === 0 ? (
            <p className={styles.rowMeta}>
              No hay campos con cambios legibles registrados para este evento.
            </p>
          ) : (
            <table className={styles.variantTable}>
              <thead>
                <tr>
                  <th scope="col">Campo</th>
                  <th scope="col">Antes</th>
                  <th scope="col">Después</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.field}>
                    <td data-label="Campo">{change.label}</td>
                    <td data-label="Antes">{change.before}</td>
                    <td data-label="Después">{change.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {truncated ? (
            <p className={styles.rowMeta}>
              Se muestran los primeros campos cambiados; el evento tiene más de los que se listan aquí.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
