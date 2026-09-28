import Link from "next/link";
import type { Route } from "next";
import { StatusBadge, type AdminTone } from "./admin-ui";
import styles from "./order-workspace.module.css";

export type OrderListRow = {
  id: string;
  href: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  district: string;
  createdRelative: string;
  createdAbsolute: string;
  total: string;
  lineCount: number;
  statusLabel: string;
  statusTone: AdminTone;
  situation: string | null;
  /** Unit-specific context chips (e.g. "Consolidado #6", "Depósito 50%"). */
  context: readonly string[];
};

/** Compact operational order rows shared by Parfums and Import. The whole
 * row is one link so keyboard users get a single tab stop per order. */
export function OrderList({ rows }: { rows: readonly OrderListRow[] }) {
  return (
    <ul className={styles.orderList} aria-label="Lista de pedidos">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={row.href as Route} className={styles.orderRow}>
            <span className={styles.orderIdentity}>
              <strong className={styles.orderNumber}>{row.orderNumber}</strong>
              <span className={styles.orderCustomer}>
                {row.customerName || "Sin nombre"}
                {row.customerPhone ? <span className={styles.orderMuted}> · <span className={styles.nowrap}>{row.customerPhone}</span></span> : null}
                {row.district ? <span className={styles.orderMuted}> · {row.district}</span> : null}
              </span>
            </span>
            <span className={styles.orderState}>
              <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
              {row.situation ? <span className={styles.orderSituation}>{row.situation}</span> : null}
              {row.context.length > 0 ? (
                <span className={styles.orderContext}>
                  {row.context.map((item) => (
                    <span key={item} className={styles.contextChip}>{item}</span>
                  ))}
                </span>
              ) : null}
            </span>
            <span className={styles.orderFigures}>
              <strong className={styles.orderTotal}>{row.total}</strong>
              <span className={styles.orderMuted}>
                {row.lineCount} producto{row.lineCount === 1 ? "" : "s"}
              </span>
              <time className={styles.orderMuted} title={row.createdAbsolute}>
                {row.createdRelative}
                <span className={styles.srOnly}> ({row.createdAbsolute})</span>
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
