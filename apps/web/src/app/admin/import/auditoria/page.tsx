import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsAuditLogRepository } from "@/domains/admin-parfums/audit-log-repository";
import { actionLabel, entityTypeLabel, summarizeEntry } from "@/domains/admin-parfums/audit-log-schema";
import { AuditFilters } from "./audit-filters";
import styles from "../productos/page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Auditoría" };

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminImportAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
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

  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : "";
  const entityType = typeof params.entity === "string" ? params.entity : "";
  const page = Math.max(1, Number(params.page) || 1);

  const repository = new AdminParfumsAuditLogRepository(supabase, "import");
  const listResult = await repository.list(
    {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    },
    { page, pageSize: PAGE_SIZE },
  );

  if (!listResult.ok) {
    return (
      <div className={styles.page}>
        <main>
          <p className={styles.notice} role="alert">No se pudo cargar la auditoría. Intenta de nuevo.</p>
        </main>
      </div>
    );
  }

  const { items, total, pageSize } = listResult.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/import" className={styles.back}>← Cruzial Import</Link>
          <h1>Auditoría</h1>
          <p>{total} evento{total === 1 ? "" : "s"} registrado{total === 1 ? "" : "s"} · solo lectura.</p>
        </div>
      </header>

      <main>
        <AuditFilters initial={{ action, entityType }} />

        {items.length === 0 ? (
          <p className={styles.empty}>No hay eventos que coincidan con este filtro.</p>
        ) : (
          <>
            <ul className={styles.list} aria-label="Lista de eventos de auditoría">
              {items.map((entry) => (
                <li key={entry.id} className={styles.row}>
                  <Link href={`/admin/import/auditoria/${entry.id}` as Route} className={styles.rowLink}>
                    <div className={styles.rowMain}>
                      <strong>{summarizeEntry(entry.entityType, entry.action, entry.entityId)}</strong>
                      <span className={styles.rowMeta}>
                        {entry.actorEmail ?? "Actor no disponible"}
                      </span>
                    </div>
                    <div className={styles.rowBadges}>
                      <span className={styles.badge}>{actionLabel(entry.action)}</span>
                      <span className={styles.badge}>{entityTypeLabel(entry.entityType)}</span>
                    </div>
                    <div className={styles.rowStats}>
                      <span>{formatDateTime(entry.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Paginación">
                {page > 1 ? (
                  <Link href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page - 1) }).toString()}`}>
                    ← Anterior
                  </Link>
                ) : (
                  <span aria-disabled="true">← Anterior</span>
                )}
                <span>Página {page} de {totalPages}</span>
                {page < totalPages ? (
                  <Link href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page + 1) }).toString()}`}>
                    Siguiente →
                  </Link>
                ) : (
                  <span aria-disabled="true">Siguiente →</span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
