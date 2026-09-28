import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  BackLink,
  Checklist,
  MetricStrip,
  NextStepCard,
  Notice,
  StatusBadge,
} from "@/components/admin/admin-ui";
import type { CampaignRow } from "@/domains/admin-import/campaigns-repository";
import type { CampaignProductItem, EligibleImportProduct } from "@/domains/admin-import/campaign-products-repository";
import type { CampaignProductAvailability } from "@/domains/admin-import/campaign-products-schema";
import {
  CHECKLIST_STATE_LABELS,
  campaignDateWindow,
  campaignStatusPresentation,
  isPreparationRelevant,
  selectImportNextAction,
  type ChecklistStep,
  type CustomerView,
} from "@/domains/admin-import/campaign-presentation";
import { CampaignEditor } from "./campaign-editor";
import styles from "../workspace.module.css";

const SECTION_ANCHOR: Record<ChecklistStep["id"], string> = {
  offers: "#productos",
  availability: "#productos",
  publication: "#preparacion",
  schedule: "#fechas",
  open: "#estado",
};

function n(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Guided consolidado workspace. Presentation only: the page has already
 * authorized the member and loaded every fact from the authoritative
 * readiness/blocker RPCs and the storefront's own public selector. */
export function ConsolidadoWorkspaceView({
  campaign,
  isAdmin,
  now,
  steps,
  customerView,
  loadFailed,
  readyForManualOpen,
  offers,
  eligibleProducts,
  initialAvailabilityFilter,
}: {
  campaign: CampaignRow;
  isAdmin: boolean;
  now: Date;
  steps: ChecklistStep[];
  customerView: CustomerView;
  loadFailed: boolean;
  readyForManualOpen: boolean | null;
  offers: CampaignProductItem[];
  eligibleProducts: EligibleImportProduct[];
  initialAvailabilityFilter: "all" | CampaignProductAvailability;
}) {
  const archived = campaign.archived_at !== null;
  const status = campaignStatusPresentation(campaign.status);
  const preparing = !archived && isPreparationRelevant(campaign.status);
  const nextAction = preparing ? selectImportNextAction(steps) : null;
  const unknownSteps = steps.some((step) => step.state === "unknown");
  const dateWindow = campaignDateWindow({ status: campaign.status, opensAt: campaign.opens_at, closesAt: campaign.closes_at, now });
  const pendingSteps = steps
    .filter((step) => step.id !== "open" && step.id !== "schedule" && step.state !== "complete")
    .map((step) => ({ key: step.id, title: step.title, detail: step.detail }));

  const availability = {
    total: offers.length,
    unconfirmed: offers.filter((offer) => offer.availabilityStatus === "unconfirmed").length,
    available: offers.filter((offer) => offer.availabilityStatus === "available").length,
    outOfStock: offers.filter((offer) => offer.availabilityStatus === "out_of_stock").length,
  };

  const view = customerView;
  const selfHref = `/admin/import/consolidados/${campaign.id}`;

  return (
    <AdminPage width="wide">
      <div>
        <BackLink href="/admin/import/consolidados">Consolidados</BackLink>
        <AdminPageHeader
          eyebrow="Cruzial Import · Consolidado"
          title={`Consolidado #${campaign.number}`}
          description={campaign.name}
          meta={isAdmin ? undefined : "Acceso de solo lectura: puedes consultar el consolidado, pero no modificarlo."}
          actions={
            <div className={styles.headerActions}>
              <StatusBadge tone={archived ? "neutral" : status.tone}>{archived ? "Archivado" : status.label}</StatusBadge>
              <ActionLink href={`/admin/import/publicacion?campaign=${campaign.id}`} variant="secondary">Revisión para publicar</ActionLink>
            </div>
          }
        />
      </div>

      {loadFailed ? (
        <Notice tone="attention" title="Parte de la información no se pudo verificar">
          Lo que ves puede estar incompleto y ningún paso se marca como completo sin verificarlo. Recarga en unos minutos.
        </Notice>
      ) : null}

      <section className={styles.hero} aria-labelledby="vista-cliente-title">
        <div className={styles.heroMain}>
          <h2 id="vista-cliente-title" className={styles.heroEyebrow}>Qué ven tus clientes</h2>
          <p className={styles.heroConsequence}>
            {archived ? "Este consolidado está archivado y queda como historial." : status.publicConsequence}
          </p>
          {view.kind === "unknown" ? (
            <p className={styles.heroLine}><StatusBadge tone="attention">Sin verificar</StatusBadge> No pudimos consultar qué muestra la tienda ahora mismo.</p>
          ) : view.kind === "this" ? (
            <p className={styles.heroLine}>
              <StatusBadge tone="healthy">Visible ahora</StatusBadge>
              La tienda muestra este consolidado{view.visibleProducts !== null ? ` con ${n(view.visibleProducts, "producto visible", "productos visibles")}` : ""}.
            </p>
          ) : view.kind === "other" ? (
            <p className={styles.heroLine}><StatusBadge tone="neutral">No visible</StatusBadge> La tienda muestra el Consolidado #{view.number} ({view.name}).</p>
          ) : (
            <p className={styles.heroLine}>
              <StatusBadge tone="neutral">No visible</StatusBadge>
              {view.reason ?? "La tienda no muestra ningún consolidado en este momento."}
            </p>
          )}
          <dl className={styles.dates}>
            <div><dt>Apertura pública</dt><dd>{dateWindow.opensLabel}</dd></div>
            <div><dt>Cierre de solicitudes</dt><dd>{dateWindow.closesLabel}</dd></div>
          </dl>
          <p className={styles.heroNote}>{dateWindow.explanation} Horario de Lima.</p>
        </div>

        <div className={styles.heroNext}>
          {archived ? (
            <NextStepCard title="Sin acciones pendientes" tone="neutral">
              <p>Un consolidado archivado no puede editarse ni abrirse.</p>
              <ActionLink href="/admin/import/consolidados" variant="secondary">Ver consolidados</ActionLink>
            </NextStepCard>
          ) : preparing ? (
            nextAction ? (
              <NextStepCard title={nextAction.title} tone={nextAction.stepId === "open" ? "healthy" : "attention"}>
                <p>{nextAction.detail}</p>
                {nextAction.stepId === "open" ? (
                  <ActionLink href="#estado" variant="primary">{isAdmin ? "Revisar y abrir" : "Ver estado"}</ActionLink>
                ) : (
                  <ActionLink href={nextAction.href} variant="primary">{nextAction.actionLabel}</ActionLink>
                )}
              </NextStepCard>
            ) : unknownSteps ? (
              <NextStepCard title="Sin verificar" tone="attention">
                <p>No pudimos confirmar el estado de preparación. Recarga la página antes de continuar.</p>
              </NextStepCard>
            ) : campaign.status === "open" ? (
              <NextStepCard title="Atender las solicitudes" tone="healthy">
                <p>El consolidado está abierto y no tiene pendientes de preparación. Revisa los pedidos que lleguen.</p>
                <ActionLink href="/admin/import/pedidos?status=pending_whatsapp_confirmation" variant="primary">Ver pedidos que necesitan atención</ActionLink>
              </NextStepCard>
            ) : (
              <NextStepCard title="Nada pendiente en la preparación" tone="healthy">
                <p>Revisa las fechas y, cuando quieras, ábrelo desde “Estado del consolidado”.</p>
                <ActionLink href="#estado" variant="primary">{isAdmin ? "Revisar y abrir" : "Ver estado"}</ActionLink>
              </NextStepCard>
            )
          ) : campaign.status === "closed" ? (
            <NextStepCard title="Atender los pedidos recibidos" tone="neutral">
              <p>Ya no se aceptan nuevas solicitudes. Cuando todos los pedidos estén atendidos, puedes marcarlo como completado.</p>
              <ActionLink href="/admin/import/pedidos?status=confirmed" variant="primary">Ver pedidos por completar</ActionLink>
            </NextStepCard>
          ) : (
            <NextStepCard title="Preparar el próximo consolidado" tone="neutral">
              <p>Este consolidado queda como historial.</p>
              <ActionLink href={isAdmin ? "/admin/import/consolidados/nuevo" : "/admin/import/consolidados"} variant="primary">
                {isAdmin ? "Crear consolidado" : "Ver consolidados"}
              </ActionLink>
            </NextStepCard>
          )}
        </div>
      </section>

      {preparing && steps.length > 0 ? (
        <AdminSection
          id="preparacion"
          title="Preparación"
          description="Cada paso se calcula con los datos actuales. Nada se marca como completo sin verificarlo."
        >
          <MetricStrip
            label="Disponibilidad de las ofertas"
            items={[
              { key: "total", label: "Ofertas", value: availability.total },
              { key: "unconfirmed", label: "Sin confirmar", value: availability.unconfirmed, ...(availability.unconfirmed > 0 ? { tone: "attention" as const } : {}) },
              { key: "available", label: "Disponibles", value: availability.available },
              { key: "out", label: "Agotadas", value: availability.outOfStock },
            ]}
          />
          <Checklist
            label={`Preparación del consolidado #${campaign.number}`}
            rows={steps.map((step) => ({
              key: step.id,
              title: step.title,
              state: step.state,
              stateLabel: CHECKLIST_STATE_LABELS[step.state],
              detail: step.detail,
              // Steps that point back at this same page become in-page anchors.
              href: step.href === selfHref ? SECTION_ANCHOR[step.id] : step.href,
              actionLabel: step.href === selfHref && step.id === "offers" ? "Ver productos" : step.actionLabel,
            }))}
          />
        </AdminSection>
      ) : null}

      <CampaignEditor
        campaign={campaign}
        campaignProducts={offers}
        eligibleProducts={eligibleProducts}
        disabled={!isAdmin}
        readyForManualOpen={readyForManualOpen}
        pendingSteps={pendingSteps}
        dateExplanation={dateWindow.explanation}
        initialAvailabilityFilter={initialAvailabilityFilter}
      />
    </AdminPage>
  );
}
