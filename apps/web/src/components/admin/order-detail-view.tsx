import {
  AdminPage,
  AdminPageHeader,
  AdminSection,
  BackLink,
  Disclosure,
  NextStepCard,
  Notice,
  ProgressTracker,
  StatusBadge,
  type AdminTone,
} from "./admin-ui";
import { CopyButton } from "./copy-button";
import type { OrderNextStep, OrderProgressStep } from "@/domains/admin/order-presentation";
import styles from "./order-workspace.module.css";

export type OrderDetailLine = {
  id: string;
  product: string;
  presentation: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type Props = {
  unitName: string;
  listHref: string;
  orderNumber: string;
  customerName: string;
  total: string;
  createdRelative: string;
  createdAbsolute: string;
  statusLabel: string;
  statusTone: AdminTone;
  progress: OrderProgressStep[] | null;
  nextStep: OrderNextStep | null;
  /** Contact shortcut shown inside the next step while the order is open. */
  nextStepContact?: React.ReactNode;
  /** Admin status controls, or a read-only note for viewers. */
  actions: React.ReactNode;
  lines: readonly OrderDetailLine[];
  subtotal: string;
  /** Unit-specific context under the order lines (Import: consolidado/deposit). */
  orderContext?: React.ReactNode;
  customer: React.ReactNode;
  delivery: React.ReactNode;
  asideExtra?: React.ReactNode;
  technical: React.ReactNode;
};

/** Shared order workspace layout for Parfums and Import. Presentation only —
 * every fact and control is supplied by the already-authorized page. */
export function OrderDetailView(props: Props) {
  const { nextStep, progress } = props;
  return (
    <AdminPage width="wide">
      <div>
        <BackLink href={props.listHref}>Pedidos</BackLink>
        <AdminPageHeader
          eyebrow={`${props.unitName} · Pedido`}
          title={`Pedido ${props.orderNumber}`}
          description={
            <>
              {props.customerName || "Cliente sin nombre"} · <strong>{props.total}</strong>
            </>
          }
          meta={
            <>
              Recibido {props.createdRelative.toLowerCase()} · <time>{props.createdAbsolute}</time> (hora de Lima)
            </>
          }
          actions={
            <div className={styles.headerMeta}>
              <StatusBadge tone={props.statusTone}>{props.statusLabel}</StatusBadge>
              <CopyButton value={props.orderNumber} label="Copiar número de pedido" />
            </div>
          }
        />
      </div>

      {progress ? (
        <ProgressTracker steps={progress} label="Progreso del pedido" />
      ) : (
        <Notice tone="attention" title="Estado no reconocido">
          No podemos interpretar el estado de este pedido, así que no mostramos un siguiente paso. Revisa el detalle técnico o consulta a soporte antes de actuar.
        </Notice>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          {nextStep ? (
            <section aria-label="Siguiente paso">
              <NextStepCard title={nextStep.title} tone={nextStep.tone}>
                <p>{nextStep.detail}</p>
                {props.nextStepContact}
                {props.actions}
              </NextStepCard>
            </section>
          ) : null}

          <AdminSection
            id="pedido"
            title="Pedido"
            description={`${props.lines.length} ${props.lines.length === 1 ? "producto" : "productos"} · precios registrados al momento de la solicitud.`}
          >
            <table className={styles.lines}>
              <caption className={styles.srOnly}>Productos del pedido {props.orderNumber}</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" className={styles.num}>Cantidad</th>
                  <th scope="col" className={styles.num}>Precio unitario</th>
                  <th scope="col" className={styles.num}>Total</th>
                </tr>
              </thead>
              <tbody>
                {props.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <span className={styles.lineProduct}>
                        <strong>{line.product}</strong>
                        {line.presentation ? <span>{line.presentation}</span> : null}
                      </span>
                    </td>
                    <td className={styles.num} data-label="Cantidad">{line.quantity}</td>
                    <td className={styles.num} data-label="Precio unitario">{line.unitPrice}</td>
                    <td className={styles.num} data-label="Total">{line.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>Subtotal</th>
                  <td className={styles.num}><strong>{props.subtotal}</strong></td>
                </tr>
              </tfoot>
            </table>
          </AdminSection>

          {props.orderContext}
        </div>

        <div className={styles.detailAside}>
          <AdminSection id="cliente" title="Cliente">{props.customer}</AdminSection>
          <AdminSection id="entrega" title="Entrega">{props.delivery}</AdminSection>
          {props.asideExtra}
        </div>
      </div>

      <Disclosure
        summary="Ver detalle técnico"
        hint="Historial de estados, reservas de inventario y avisos automáticos"
      >
        {props.technical}
      </Disclosure>
    </AdminPage>
  );
}
