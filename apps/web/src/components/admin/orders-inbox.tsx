import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  FilterTabs,
  Notice,
  Pagination,
} from "./admin-ui";
import { OrderFilters, type OrderStatusOption } from "./order-filters";
import { OrderList, type OrderListRow } from "./order-list";
import {
  ORDER_FILTER_TABS,
  emptyOrdersMessage,
  orderListHref,
} from "@/domains/admin/order-presentation";
import styles from "./order-workspace.module.css";

const STATUS_OPTIONS: OrderStatusOption[] = ORDER_FILTER_TABS.filter((tab) => tab.status !== "").map((tab) => ({
  value: tab.status,
  label: tab.label,
}));

export type OrdersInboxProps = {
  unitName: string;
  basePath: string;
  isAdmin: boolean;
  filters: { search: string; status: string; age: string };
  /** Unit-wide totals per stored status; null when they could not be read. */
  counts: Record<string, number> | null;
  result:
    | { ok: true; rows: readonly OrderListRow[]; total: number; page: number; totalPages: number }
    | { ok: false };
  hrefForPage: (page: number) => string;
};

/** Shared order inbox for Parfums and Import. Presentation only: the page
 * has already authorized the member and loaded data through the unit's
 * repository with its existing filters and pagination. */
export function OrdersInbox({ unitName, basePath, isAdmin, filters, counts, result, hrefForPage }: OrdersInboxProps) {
  const pending = counts?.pending_whatsapp_confirmation ?? null;
  const filtered = Boolean(filters.search || filters.age);
  const tabs = ORDER_FILTER_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: orderListHref(basePath, filters, tab.status),
    count: tab.status === "" ? null : counts ? counts[tab.status] ?? 0 : null,
    current: filters.status === tab.status,
    tone: tab.key === "attention" ? ("attention" as const) : ("neutral" as const),
  }));
  const empty = emptyOrdersMessage(filters.status, filtered);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={unitName}
        title="Pedidos"
        description="Revisa primero los pedidos que necesitan una decisión."
        meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar los pedidos, pero no cambiar su estado."}
      />

      {pending !== null && pending > 0 && filters.status !== "pending_whatsapp_confirmation" ? (
        <Notice
          tone="attention"
          title={`${pending} ${pending === 1 ? "pedido necesita" : "pedidos necesitan"} atención`}
          action={
            <ActionLink href={orderListHref(basePath, { search: "", age: "" }, "pending_whatsapp_confirmation")} variant="secondary">
              Ver pedidos que necesitan atención
            </ActionLink>
          }
        >
          {pending === 1 ? "Espera" : "Esperan"} confirmación del cliente por WhatsApp.
        </Notice>
      ) : null}

      <div className={styles.toolbar}>
        <FilterTabs tabs={tabs} label="Filtrar pedidos por estado" />
        <OrderFilters
          statusOptions={STATUS_OPTIONS}
          initial={{ search: filters.search, status: filters.status, age: filters.age }}
          showStatus={false}
        />
      </div>

      {!result.ok ? (
        <Notice tone="danger" title="No pudimos cargar los pedidos">
          Recarga la página. Si el problema continúa, revisa Operaciones antes de asumir que no hay pedidos.
        </Notice>
      ) : result.rows.length === 0 ? (
        <EmptyState title={empty.title}>{empty.detail}</EmptyState>
      ) : (
        <>
          <p className={styles.resultCount} aria-live="polite">
            {result.total} {result.total === 1 ? "pedido" : "pedidos"}
            {filters.status || filtered ? " en esta vista" : " en total"}
            {counts === null ? " · No pudimos verificar los totales por estado." : ""}
          </p>
          <OrderList rows={result.rows} />
          <Pagination page={result.page} totalPages={result.totalPages} hrefFor={hrefForPage} />
        </>
      )}
    </AdminPage>
  );
}
