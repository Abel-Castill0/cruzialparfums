import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AdminParfumsWholesaleRepository,
  type WholesaleEligibilityStatus,
} from "@/domains/admin-parfums/wholesale-repository";
import {
  WHOLESALE_COMMERCIAL_TYPES,
  WHOLESALE_COMMERCIAL_TYPE_LABELS,
  isWholesaleCommercialType,
  type WholesaleCommercialType,
} from "@/domains/admin-parfums/wholesale-schema";
import { WholesalePolicyEditor } from "./policy-editor";
import baseStyles from "../productos/page.module.css";
import styles from "./wholesale.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mayorista" };
const PAGE_SIZE = 30;
const ELIGIBILITY_STATUSES: WholesaleEligibilityStatus[] = [
  "eligible",
  "missing_classification",
  "ambiguous_classification",
  "unsupported_classification",
  "policy_disabled",
];

const ELIGIBILITY_LABELS: Record<WholesaleEligibilityStatus, string> = {
  eligible: "Elegible",
  missing_classification: "Falta clasificación comercial",
  ambiguous_classification: "Clasificación comercial ambigua",
  unsupported_classification: "Clasificación comercial no soportada",
  policy_disabled: "Política desactivada",
};

function isEligibilityStatus(value: unknown): value is WholesaleEligibilityStatus {
  return typeof value === "string" && ELIGIBILITY_STATUSES.includes(value as WholesaleEligibilityStatus);
}

function money(amount: number | null, currency = "PEN"): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
}

export default async function AdminWholesalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (session.status === "not_configured" || session.status === "unavailable" || session.status === "no_membership") redirect("/admin");
  if (session.status === "signed_out") redirect("/admin/login");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className={baseStyles.page}><main><p className={baseStyles.notice}>El backend de administración no está configurado.</p></main></div>;
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const commercialType = isWholesaleCommercialType(params.type) ? params.type : undefined;
  const eligibilityStatus = isEligibilityStatus(params.eligibility) ? params.eligibility : undefined;
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const repository = new AdminParfumsWholesaleRepository(supabase, membership.businessUnitId);
  const [policiesResult, catalogResult] = await Promise.all([
    repository.listPolicies(),
    repository.listCatalog(
      {
        search,
        ...(commercialType ? { commercialType } : {}),
        ...(eligibilityStatus ? { eligibilityStatus } : {}),
      },
      { page, pageSize: PAGE_SIZE },
    ),
  ]);

  if (!policiesResult.ok || !catalogResult.ok) {
    return <div className={baseStyles.page}><main><p className={baseStyles.notice} role="alert">No se pudo cargar Mayorista. Intenta de nuevo.</p></main></div>;
  }

  const policiesByType = new Map(
    policiesResult.data
      .filter((policy) => isWholesaleCommercialType(policy.commercial_type))
      .map((policy) => [policy.commercial_type as WholesaleCommercialType, policy]),
  );
  const { items, total, pageSize } = catalogResult.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginationHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (commercialType) next.set("type", commercialType);
    if (eligibilityStatus) next.set("eligibility", eligibilityStatus);
    next.set("page", String(nextPage));
    return `?${next.toString()}` as Route;
  };

  return (
    <div className={baseStyles.page}>
      <header className={baseStyles.header}>
        <div>
          <Link href="/admin/parfums" className={baseStyles.back}>← Cruzial Parfums</Link>
          <h1>Mayorista</h1>
          <p>Reglas por tipo comercial y frascos elegibles.</p>
        </div>
      </header>

      <main className={styles.main}>
        {membership.role !== "admin" ? (
          <p className={baseStyles.notice} role="status">Estás en modo solo lectura para Parfums.</p>
        ) : null}

        <section aria-labelledby="rules-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Contrato vigente</p>
              <h2 id="rules-title">Reglas por tipo comercial</h2>
            </div>
            <p>Los productos distintos se acumulan dentro del mismo tipo. Árabe, diseñador y nicho nunca se mezclan entre sí.</p>
          </div>
          <div className={styles.policyGrid}>
            {WHOLESALE_COMMERCIAL_TYPES.map((type) => {
              const policy = policiesByType.get(type);
              return policy ? (
                <WholesalePolicyEditor key={policy.id} policy={policy} disabled={membership.role !== "admin"} />
              ) : (
                <article className={styles.policyCard} key={type}>
                  <h2>{WHOLESALE_COMMERCIAL_TYPE_LABELS[type]}</h2>
                  <p className={styles.warning} role="alert">Falta la política estructural. Revisa las migraciones.</p>
                </article>
              );
            })}
          </div>
          <p className={styles.ruleNote}>Solo cuentan variantes registradas como <strong>frasco</strong>. Los decants de 3 ml, 5 ml y 10 ml quedan excluidos del umbral.</p>
        </section>

        <section aria-labelledby="catalog-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Catálogo administrativo</p>
              <h2 id="catalog-title">Frascos completos</h2>
            </div>
            <p>{total} variante{total === 1 ? "" : "s"} de frasco en esta vista.</p>
          </div>

          <form className={styles.filters} method="get" role="search">
            <label className={styles.searchField}>
              <span>Buscar producto, marca o variante</span>
              <input type="search" name="q" defaultValue={search} />
            </label>
            <label>
              <span>Tipo comercial</span>
              <select name="type" defaultValue={commercialType ?? ""}>
                <option value="">Todos</option>
                {WHOLESALE_COMMERCIAL_TYPES.map((type) => <option key={type} value={type}>{WHOLESALE_COMMERCIAL_TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label>
              <span>Elegibilidad</span>
              <select name="eligibility" defaultValue={eligibilityStatus ?? ""}>
                <option value="">Todas</option>
                {ELIGIBILITY_STATUSES.map((status) => <option key={status} value={status}>{ELIGIBILITY_LABELS[status]}</option>)}
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit">Aplicar</button>
              <Link href={"/admin/parfums/mayorista" as Route}>Limpiar</Link>
            </div>
          </form>

          {items.length === 0 ? (
            <p className={styles.empty}>No hay frascos que coincidan con estos filtros.</p>
          ) : (
            <div className={styles.tableFrame}>
              <table className={styles.catalogTable}>
                <caption className={baseStyles.srOnly}>Productos y variantes elegibles para mayorista</caption>
                <thead>
                  <tr>
                    <th>Producto</th><th>Tipo</th><th>Frasco</th><th>Precio base</th><th>Precio mayorista</th><th>Disponibilidad</th><th>Publicación</th><th>Elegibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.variant_id}>
                      <td data-label="Producto"><strong>{item.product_name}</strong><small>{item.brand ?? "Sin marca registrada"}</small></td>
                      <td data-label="Tipo">{isWholesaleCommercialType(item.commercial_type) ? WHOLESALE_COMMERCIAL_TYPE_LABELS[item.commercial_type] : "—"}</td>
                      <td data-label="Frasco">{item.variant_label}</td>
                      <td data-label="Precio base">{money(item.base_price_amount, item.currency)}</td>
                      <td data-label="Precio mayorista">{money(item.wholesale_price_amount, item.currency)}</td>
                      <td data-label="Disponibilidad">{item.availability_status === "available" ? "Disponible" : item.availability_status === "out_of_stock" ? "Agotado" : "Sin estado"}</td>
                      <td data-label="Publicación"><span>{item.product_publication_status}</span><small>Variante: {item.variant_publication_status}</small></td>
                      <td data-label="Elegibilidad"><span className={item.eligibility_status === "eligible" ? styles.eligible : styles.ineligible}>{ELIGIBILITY_LABELS[item.eligibility_status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 ? (
            <nav className={baseStyles.pagination} aria-label="Paginación de frascos">
              {page > 1 ? <Link href={paginationHref(page - 1)}>← Anterior</Link> : <span aria-disabled="true">← Anterior</span>}
              <span>Página {page} de {totalPages}</span>
              {page < totalPages ? <Link href={paginationHref(page + 1)}>Siguiente →</Link> : <span aria-disabled="true">Siguiente →</span>}
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  );
}
