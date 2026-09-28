import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  Notice,
  Pagination,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { AdminParfumsCombosRepository } from "@/domains/admin-parfums/combos-repository";
import { computeComboReadiness, isVerificationStatus } from "@/domains/admin-parfums/combo-schema";
import {
  COMBO_BLOCKER_OWNER_LABELS,
  comboVerificationLabel,
  comboVerificationTone,
  comboVisibility,
} from "@/domains/admin-parfums/combo-presentation";
import { PRODUCT_STATUS_LABELS, type PublicationStatus } from "@/domains/admin-parfums/product-schema";
import { formatRelativeLima } from "@/domains/admin/order-presentation";
import { ComboFilters } from "./combo-filters";
import styles from "@/components/admin/catalog-workspace.module.css";
import comboStyles from "./combos.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Combos" };
const PAGE_SIZE = 20;
const BASE_PATH = "/admin/parfums/combos";

export default async function CombosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") {
    redirect("/admin");
  }
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");
  const isAdmin = membership.role === "admin";

  const header = (
    <AdminPageHeader
      eyebrow="Cruzial Parfums"
      title="Combos"
      description="Administra los sets que aparecen en Cruzial Parfums."
      meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar los combos y su composición, pero no modificarlos."}
      actions={isAdmin ? <ActionLink href={`${BASE_PATH}/nuevo`} variant="primary">+ Crear combo</ActionLink> : undefined}
    />
  );

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        {header}
        <Notice tone="danger" title="El backend de administración no está configurado en este entorno." />
      </AdminPage>
    );
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const verificationStatus = isVerificationStatus(params.verification) ? params.verification : undefined;
  const includeArchived = params.archived === "1";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);

  const repository = new AdminParfumsCombosRepository(supabase, membership.businessUnitId);
  const result = await repository.list(
    {
      search,
      includeArchived,
      ...(verificationStatus ? { verificationStatus } : {}),
    },
    { page, pageSize: PAGE_SIZE },
  );

  const cleanParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") cleanParams.set(key, value);
  const paginationHref = (nextPage: number) => {
    const next = new URLSearchParams(cleanParams);
    next.set("page", String(nextPage));
    return `?${next.toString()}`;
  };
  const noFilters = !search && !verificationStatus && !includeArchived;
  const now = new Date();

  return (
    <AdminPage>
      {header}

      <p className={comboStyles.scopeNote}>
        Cada combo se apoya en un producto Parfums: nombre, precio, fotos y publicación se editan en el producto; aquí
        se administra qué incluye el combo y si esa composición está verificada.
      </p>

      <ComboFilters initial={{ search, verificationStatus, includeArchived }} />

      {!result.ok ? (
        <Notice tone="danger" title="No pudimos cargar los combos">
          Recarga la página. No asumas que no hay combos.
        </Notice>
      ) : result.data.items.length === 0 ? (
        <EmptyState title={noFilters ? "Todavía no hay combos." : "No hay combos que coincidan con estos filtros."}>
          {noFilters
            ? isAdmin ? "Crea uno sobre un producto Parfums existente con “Crear combo”." : null
            : "Prueba con otra búsqueda o quita filtros."}
        </EmptyState>
      ) : (
        <>
          <p className={styles.muted} aria-live="polite">
            {result.data.total} {result.data.total === 1 ? "combo" : "combos"} en esta vista.
          </p>
          <ul className={styles.list} aria-label="Lista de combos">
            {result.data.items.map((combo) => {
              const blockers = computeComboReadiness({
                productPublicationStatus: combo.product_publication_status,
                productArchived: combo.product_archived,
                comboArchived: combo.archived_at !== null,
                compositionVerificationStatus: combo.composition_verification_status,
                itemCount: combo.item_count,
                hasArchivedItem: combo.has_archived_item,
              });
              const visibility = comboVisibility(blockers);
              const firstBlocker = blockers[0];
              const publication = combo.product_publication_status as PublicationStatus;
              return (
                <li key={combo.id}>
                  <Link href={`${BASE_PATH}/${combo.id}` as Route} className={`${styles.row} ${styles.rowNoThumb}`}>
                    <span className={styles.identity}>
                      <strong className={styles.name}>{combo.product_name}</strong>
                      <span className={styles.muted}>
                        {combo.product_brand ?? "Sin marca"} · Producto {(PRODUCT_STATUS_LABELS[publication] ?? "en estado desconocido").toLowerCase()}
                      </span>
                    </span>
                    <span className={styles.state}>
                      <span className={styles.badges}>
                        <StatusBadge tone={visibility.tone}>{visibility.label}</StatusBadge>
                        <StatusBadge tone={comboVerificationTone(combo.composition_verification_status)}>
                          {comboVerificationLabel(combo.composition_verification_status, "short")}
                        </StatusBadge>
                      </span>
                      {firstBlocker && firstBlocker !== "combo_archived" ? (
                        <span className={comboStyles.attention}>
                          <span aria-hidden="true">! </span>
                          <span className={styles.srOnly}>Requiere atención: </span>
                          {COMBO_BLOCKER_OWNER_LABELS[firstBlocker]}
                          {blockers.length > 1 ? ` (+${blockers.length - 1} más)` : ""}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.figures}>
                      <span>{combo.item_count} {combo.item_count === 1 ? "producto incluido" : "productos incluidos"}</span>
                      <span>Actualizado {formatRelativeLima(combo.updated_at, now).toLowerCase()}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(result.data.total / result.data.pageSize))}
            hrefFor={paginationHref}
            label="Paginación de combos"
          />
        </>
      )}
    </AdminPage>
  );
}
