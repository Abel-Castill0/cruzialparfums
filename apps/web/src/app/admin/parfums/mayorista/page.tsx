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
  AdminSection,
  EmptyState,
  FilterTabs,
  MetricStrip,
  Notice,
  Pagination,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { AdminParfumsWholesaleRepository, type WholesalePolicyRow } from "@/domains/admin-parfums/wholesale-repository";
import {
  WHOLESALE_COMMERCIAL_TYPES,
  WHOLESALE_COMMERCIAL_TYPE_LABELS,
  isWholesaleCommercialType,
  type WholesaleCommercialType,
} from "@/domains/admin-parfums/wholesale-schema";
import {
  AVAILABILITY_LABELS,
  WHOLESALE_ATTENTION_PARAM,
  WHOLESALE_ATTENTION_STATUSES,
  WHOLESALE_ELIGIBILITY_HINTS,
  WHOLESALE_ELIGIBILITY_LABELS,
  WHOLESALE_ELIGIBILITY_STATUSES,
  commercialTypeLabel,
  currentWholesaleView,
  formatMoney,
  parseWholesaleEligibilityParam,
  storefrontExclusionReason,
  summarizePolicy,
  wholesaleEligibilityTone,
} from "@/domains/admin-parfums/wholesale-presentation";
import { WholesalePolicyEditor } from "./policy-editor";
import catalogStyles from "@/components/admin/catalog-workspace.module.css";
import styles from "./wholesale.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mayorista" };
const PAGE_SIZE = 30;
const BASE_PATH = "/admin/parfums/mayorista";
const PUBLIC_PATH = "/parfums/mayorista";

export default async function AdminWholesalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");
  const isAdmin = membership.role === "admin";

  const header = (
    <AdminPageHeader
      eyebrow="Cruzial Parfums"
      title="Mayorista"
      description="Reglas de precio por mayor y frascos que califican."
      meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar las reglas y los frascos, pero no modificarlos."}
      actions={<ActionLink href={PUBLIC_PATH} external>Ver Mayorista como cliente</ActionLink>}
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
  const commercialType = isWholesaleCommercialType(params.type) ? params.type : undefined;
  const eligibilityFilter = parseWholesaleEligibilityParam(params.eligibility);
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const repository = new AdminParfumsWholesaleRepository(supabase, membership.businessUnitId);
  const [policiesResult, catalogResult, counts] = await Promise.all([
    repository.listPolicies(),
    repository.listCatalog(
      {
        search,
        ...(commercialType ? { commercialType } : {}),
        ...(eligibilityFilter.kind === "status" ? { eligibilityStatus: eligibilityFilter.status } : {}),
        ...(eligibilityFilter.kind === "attention" ? { needsAttention: true } : {}),
      },
      { page, pageSize: PAGE_SIZE },
    ),
    repository.countByEligibility(),
  ]);

  const baseParams = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: search || undefined,
      type: commercialType,
      eligibility: eligibilityFilter.kind === "attention" ? WHOLESALE_ATTENTION_PARAM : eligibilityFilter.kind === "status" ? eligibilityFilter.status : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return `${BASE_PATH}${query ? `?${query}` : ""}`;
  };

  const policiesByType = new Map<WholesaleCommercialType, WholesalePolicyRow>();
  if (policiesResult.ok) {
    for (const policy of policiesResult.data) {
      if (isWholesaleCommercialType(policy.commercial_type) && !policiesByType.has(policy.commercial_type)) {
        policiesByType.set(policy.commercial_type, policy);
      }
    }
  }
  const summaries = WHOLESALE_COMMERCIAL_TYPES.map((type) => {
    const policy = policiesByType.get(type);
    return { type, policy, summary: policy ? summarizePolicy(policy, type) : null };
  });
  const activeRules = policiesResult.ok
    ? summaries.filter((entry) => entry.summary?.complete && entry.summary.active).length
    : null;
  const attentionCount = counts ? WHOLESALE_ATTENTION_STATUSES.reduce((sum, status) => sum + counts[status], 0) : null;
  const totalCount = counts ? attentionCount! + counts.eligible : null;
  const currentView = currentWholesaleView(eligibilityFilter);

  return (
    <AdminPage width="wide">
      {header}

      <MetricStrip
        label="Resumen de Mayorista"
        items={[
          { key: "rules", label: "Reglas activas", value: activeRules },
          { key: "eligible", label: "Frascos listos para Mayorista", value: counts?.eligible ?? null, tone: "healthy" },
          { key: "attention", label: "Frascos que necesitan atención", value: attentionCount, ...(attentionCount ? { tone: "attention" as const } : {}) },
        ]}
      />

      <AdminSection id="como-funciona" title="Cómo funciona" description="Así calcula el sistema el precio por mayor. Los valores vienen de las reglas guardadas.">
        <ul className={styles.rules}>
          <li><strong>Solo frascos completos.</strong> Mayorista usa frascos completos. Los decants no cuentan para el mínimo ni reciben descuento.</li>
          <li><strong>Cada tipo suma por separado.</strong> Se pueden combinar perfumes distintos del mismo tipo, pero Árabe, Diseñador y Nicho no se mezclan para llegar al mínimo.</li>
          <li><strong>Descuento por frasco.</strong> Al llegar al mínimo de su tipo, cada frasco de ese tipo cuesta su precio normal menos el descuento de la regla.</li>
        </ul>
      </AdminSection>

      <AdminSection
        id="reglas"
        title="Reglas por tipo comercial"
        description={isAdmin ? "Cada tipo tiene su propia regla. Edita una a la vez; los cambios aplican a la tienda al guardar." : "Cada tipo tiene su propia regla."}
      >
        {!policiesResult.ok ? (
          <Notice tone="danger" title="No pudimos verificar las reglas mayoristas">
            Recarga la página. No asumas ningún mínimo ni descuento hasta que carguen.
          </Notice>
        ) : (
          <div className={styles.policyGrid}>
            {summaries.map(({ type, policy }) =>
              policy ? (
                <WholesalePolicyEditor key={policy.id} policy={policy} fallbackType={type} canWrite={isAdmin} />
              ) : (
                <article className={styles.policyCard} key={type} aria-labelledby={`policy-${type}-title`}>
                  <div className={styles.policyHeading}>
                    <h3 id={`policy-${type}-title`}>{WHOLESALE_COMMERCIAL_TYPE_LABELS[type]}</h3>
                    <StatusBadge tone="danger">Sin configurar</StatusBadge>
                  </div>
                  <Notice tone="danger" title="Falta la configuración de esta regla">
                    No existe una regla mayorista para este tipo. Sus frascos no pueden recibir precio mayorista. Requiere revisión técnica.
                  </Notice>
                </article>
              ),
            )}
          </div>
        )}
      </AdminSection>

      <AdminSection id="vista-cliente" title="Qué ven tus clientes" description="La página pública de Mayorista usa estas mismas reglas.">
        <div className={catalogStyles.card}>
          {!policiesResult.ok ? (
            <p className={catalogStyles.muted}>No podemos confirmarlo mientras las reglas no carguen.</p>
          ) : (
            <ul className={styles.publicList}>
              {summaries.map(({ type, summary }) => (
                <li key={type}>
                  <StatusBadge tone={summary?.complete && summary.active ? "healthy" : "neutral"}>
                    {summary?.complete && summary.active ? "Se muestra" : "No se muestra"}
                  </StatusBadge>
                  <span>
                    <strong>{WHOLESALE_COMMERCIAL_TYPE_LABELS[type]}</strong>{" "}
                    {summary?.complete && summary.active
                      ? `— desde ${summary.minQuantity} frascos, ${summary.discountText} menos por frasco.`
                      : summary && !summary.active
                        ? "— regla desactivada: sus frascos aparecen sin precio mayorista (“A confirmar”)."
                        : "— sin regla válida: sus frascos aparecen sin precio mayorista."}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={catalogStyles.muted}>
            La tienda solo lista frascos de productos publicados y disponibles. Un frasco “Listo para Mayorista” en este
            panel no aparece si su producto está sin publicar, archivado o agotado.
          </p>
          <div className={catalogStyles.actionsRow}>
            <ActionLink href={PUBLIC_PATH} external>Ver Mayorista como cliente</ActionLink>
          </div>
        </div>
      </AdminSection>

      <AdminSection id="frascos" title="Frascos" description="Todos los frascos completos de Parfums y si califican para Mayorista.">
        <div className={catalogStyles.toolbar}>
          <FilterTabs
            label="Ver frascos por estado"
            tabs={[
              { key: "all", label: "Todos", href: baseParams({ eligibility: undefined }), count: totalCount, current: currentView === "all" },
              { key: "eligible", label: "Listos para Mayorista", href: baseParams({ eligibility: "eligible" }), count: counts?.eligible ?? null, current: currentView === "eligible" },
              { key: "attention", label: "Necesitan atención", href: baseParams({ eligibility: WHOLESALE_ATTENTION_PARAM }), count: attentionCount, current: currentView === "attention", tone: "attention" },
            ]}
          />
          <form className={catalogStyles.filterBar} method="get" role="search" aria-label="Filtrar frascos">
            <label className={`${catalogStyles.field} ${catalogStyles.fieldWide}`}>
              <span>Buscar</span>
              <input type="search" name="q" defaultValue={search} placeholder="Producto, marca o frasco…" />
            </label>
            <label className={catalogStyles.field}>
              <span>Tipo comercial</span>
              <select name="type" defaultValue={commercialType ?? ""}>
                <option value="">Todos</option>
                {WHOLESALE_COMMERCIAL_TYPES.map((type) => <option key={type} value={type}>{WHOLESALE_COMMERCIAL_TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className={catalogStyles.field}>
              <span>Estado</span>
              <select
                name="eligibility"
                defaultValue={eligibilityFilter.kind === "attention" ? WHOLESALE_ATTENTION_PARAM : eligibilityFilter.kind === "status" ? eligibilityFilter.status : ""}
              >
                <option value="">Todos</option>
                <option value={WHOLESALE_ATTENTION_PARAM}>Necesitan atención (todos)</option>
                {WHOLESALE_ELIGIBILITY_STATUSES.map((status) => <option key={status} value={status}>{WHOLESALE_ELIGIBILITY_LABELS[status]}</option>)}
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit">Aplicar</button>
              <Link href={BASE_PATH as Route}>Limpiar</Link>
            </div>
          </form>
        </div>

        {!catalogResult.ok ? (
          <Notice tone="danger" title="No pudimos cargar los frascos">
            Recarga la página. No asumas que no hay frascos elegibles.
          </Notice>
        ) : catalogResult.data.items.length === 0 ? (
          <EmptyState title="No hay frascos que coincidan con estos filtros.">
            {currentView === "attention" && !search && !commercialType ? "Ningún frasco necesita atención." : "Prueba con otra búsqueda o quita filtros."}
          </EmptyState>
        ) : (
          <>
            <p className={catalogStyles.muted} aria-live="polite">
              {catalogResult.data.total} {catalogResult.data.total === 1 ? "frasco" : "frascos"} en esta vista.
              {counts === null ? " No pudimos verificar los totales por estado." : ""}
            </p>
            <ul className={styles.bottleList} aria-label="Frascos y su estado mayorista">
              {catalogResult.data.items.map((item) => {
                const typeLabel = commercialTypeLabel(item.commercial_type);
                const excluded = storefrontExclusionReason(item);
                return (
                  <li key={item.variant_id} className={styles.bottle}>
                    <div className={styles.bottleIdentity}>
                      <Link href={`/admin/parfums/productos/${item.product_id}` as Route} className={styles.bottleName}>
                        {item.product_name}
                      </Link>
                      <span className={catalogStyles.muted}>
                        {item.brand ?? "Sin marca"} · Frasco {item.variant_label}
                      </span>
                      <span className={catalogStyles.muted}>
                        {typeLabel ? `Tipo: ${typeLabel}` : "Sin tipo comercial"}
                      </span>
                    </div>
                    <dl className={styles.prices}>
                      <div>
                        <dt>Precio normal</dt>
                        <dd>{formatMoney(item.base_price_amount, item.currency)}</dd>
                      </div>
                      <div>
                        <dt>Precio mayorista</dt>
                        <dd>
                          {item.wholesale_price_amount === null
                            ? <span className={styles.unavailable}>Sin precio mayorista</span>
                            : <strong>{formatMoney(item.wholesale_price_amount, item.currency)}</strong>}
                        </dd>
                      </div>
                    </dl>
                    <div className={styles.bottleState}>
                      <span className={catalogStyles.badges}>
                        <StatusBadge tone={wholesaleEligibilityTone(item.eligibility_status)}>
                          {WHOLESALE_ELIGIBILITY_LABELS[item.eligibility_status]}
                        </StatusBadge>
                        <StatusBadge tone={item.availability_status === "out_of_stock" ? "attention" : "neutral"}>
                          {item.availability_status ? AVAILABILITY_LABELS[item.availability_status] ?? "Sin estado de stock" : "Sin estado de stock"}
                        </StatusBadge>
                      </span>
                      {item.eligibility_status !== "eligible" ? (
                        <span className={styles.hint}>{WHOLESALE_ELIGIBILITY_HINTS[item.eligibility_status]}</span>
                      ) : null}
                      {excluded ? <span className={catalogStyles.muted}>No aparece en la tienda: {excluded}.</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(catalogResult.data.total / catalogResult.data.pageSize))}
              hrefFor={(nextPage) => baseParams({ page: String(nextPage) })}
              label="Paginación de frascos"
            />
          </>
        )}
      </AdminSection>
    </AdminPage>
  );
}
