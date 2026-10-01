import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AttentionList,
  Checklist,
  EmptyState,
  Notice,
  StatusBadge,
  type AttentionItem,
} from "@/components/admin/admin-ui";
import { legalIdentityNotice, missingLegalIdentity } from "@/domains/admin-parfums/legal-readiness";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import {
  CHECKLIST_STATE_LABELS,
  campaignStatusPresentation,
  deriveCustomerView,
  formatLimaDateTime,
  isPreparationRelevant,
  selectImportNextAction,
  type ChecklistStep,
  type CustomerView,
} from "@/domains/admin-import/campaign-presentation";
import {
  countOpenImportCampaigns,
  fetchPublicImportCampaign,
  loadCampaignPreparation,
} from "@/domains/admin-import/campaign-workspace-loader";
import styles from "../dashboard.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cruzial Import Admin" };

type CampaignRow = {
  id: string;
  number: number;
  name: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  archived_at: string | null;
};

function n(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// Guided workspace for the current consolidado. Public visibility comes from
// the same public selector the storefront uses; readiness comes from the
// campaign-scoped readiness/blocker RPCs. Nothing here changes state, and an
// unreadable fact is shown as "sin verificar" — never as complete.
export default async function AdminImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const selectedId = typeof params.campaign === "string" && isValidUuid(params.campaign) ? params.campaign : null;
  const result = await getAdminSession();

  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
  );
  if (!membership) redirect("/admin");

  const isAdmin = membership.role === "admin";
  const operational: AttentionItem[] = [];
  let loadFailed = false;
  let campaign: CampaignRow | null = null;
  let steps: ChecklistStep[] = [];
  let customerView: CustomerView = { kind: "unknown" };

  const now = new Date();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    loadFailed = true;
  } else {
    const unitId = membership.businessUnitId;

    const [campaignResult, orderCounts, pendingCustomers, contactSetting, complaintCounts, publicCampaign, openCampaignCount, legalSetting] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id,number,name,status,opens_at,closes_at,archived_at")
        .eq("business_unit_id", unitId)
        .or(selectedId ? `id.eq.${selectedId}` : "archived_at.is.null")
        .is("archived_at", null)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      new AdminImportOrdersRepository(supabase, unitId).countByStatus(),
      new AdminImportCustomersRepository(supabase, unitId).countPendingVerification(),
      new AdminParfumsSettingsRepository(supabase, unitId, "import").getPublicContact(),
      new AdminComplaintsRepository(supabase, unitId).countByStatus(),
      fetchPublicImportCampaign(supabase),
      countOpenImportCampaigns(supabase, unitId),
      new AdminParfumsSettingsRepository(supabase, unitId, "import").getBusinessLegal(),
    ]);

    if (campaignResult.error || orderCounts === null || pendingCustomers === null || complaintCounts === null || !contactSetting.ok || !legalSetting.ok) {
      loadFailed = true;
    }
    campaign = (campaignResult.data as CampaignRow | null) ?? null;

    if (campaign) {
      const preparation = await loadCampaignPreparation(supabase, campaign, {
        canEdit: isAdmin,
        now,
        publicCampaign,
        openCampaignCount,
      });
      if (preparation.loadFailed) loadFailed = true;
      steps = preparation.steps;
      customerView = preparation.customerView;
    } else {
      customerView = deriveCustomerView({ campaign: null, publicCampaign, visibleProducts: null, openCampaignCount, now });
    }

    const contactConfigured = contactSetting.ok && contactSetting.data !== null;
    const pendingOrders = orderCounts?.pending_whatsapp_confirmation ?? 0;
    const confirmedOrders = orderCounts?.confirmed ?? 0;
    const newComplaints = complaintCounts?.received ?? 0;

    if (newComplaints > 0) {
      operational.push({
        key: "complaints",
        title: `${n(newComplaints, "reclamo nuevo", "reclamos nuevos")} sin revisar`,
        detail: "Un cliente registró un reclamo. Revísalo y registra la respuesta.",
        href: "/admin/import/reclamos?status=received",
        actionLabel: "Revisar reclamos",
        tone: "danger",
      });
    }
    if (contactSetting.ok && !contactConfigured) {
      operational.push({
        key: "contact",
        title: "Contacto público de WhatsApp sin configurar",
        detail: "Tus clientes no tienen un número al cual escribir desde la tienda.",
        href: "/admin/import/configuracion",
        actionLabel: isAdmin ? "Configurar contacto" : "Ver configuración",
        tone: "danger",
      });
    }
    const legalNotice = legalSetting.ok ? legalIdentityNotice(missingLegalIdentity(legalSetting.data?.value ?? null)) : null;
    if (legalNotice) {
      operational.push({
        key: "legal",
        title: legalNotice.title,
        detail: legalNotice.detail,
        href: "/admin/import/configuracion",
        actionLabel: isAdmin ? "Completar datos" : "Ver configuración",
        tone: "attention",
      });
    }
    if (pendingOrders > 0) {
      operational.push({
        key: "orders-pending",
        title: `${n(pendingOrders, "solicitud espera", "solicitudes esperan")} confirmación por WhatsApp`,
        detail: "Revisa el contacto con el cliente antes de continuar.",
        href: "/admin/import/pedidos?status=pending_whatsapp_confirmation",
        actionLabel: "Revisar pedidos",
        tone: "attention",
      });
    }
    if (confirmedOrders > 0) {
      operational.push({
        key: "orders-confirmed",
        title: `${n(confirmedOrders, "pedido confirmado", "pedidos confirmados")} por completar`,
        href: "/admin/import/pedidos?status=confirmed",
        actionLabel: "Ver pedidos",
        tone: "neutral",
      });
    }
    if ((pendingCustomers ?? 0) > 0) {
      operational.push({
        key: "customers",
        title: `${n(pendingCustomers!, "cliente pendiente", "clientes pendientes")} de verificación`,
        href: "/admin/import/clientes?status=pending_verification",
        actionLabel: "Revisar clientes",
        tone: "neutral",
      });
    }
  }

  const status = campaign ? campaignStatusPresentation(campaign.status) : null;
  const preparing = campaign ? isPreparationRelevant(campaign.status) : false;
  const nextAction = preparing ? selectImportNextAction(steps) : null;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Resumen"
        title="Cruzial Import"
        description="Prepara tu consolidado, atiende solicitudes y revisa lo que ven tus clientes."
        meta={isAdmin ? "Acceso de administrador." : "Acceso de solo lectura: puedes consultar la información, pero no modificarla."}
        actions={<ActionLink href="/import" external>Ver Cruzial Import</ActionLink>}
      />

      {loadFailed ? (
        <Notice tone="attention" title="Parte de la información no se pudo cargar">
          Lo que ves abajo puede estar incompleto y ningún paso se marca como completo sin verificarlo. Recarga en unos minutos; si persiste, revisa Operaciones.
        </Notice>
      ) : null}

      {campaign && status ? (
        <section className={styles.hero} aria-labelledby="consolidado-title">
          <div className={styles.heroMain}>
            <p className={styles.heroEyebrow}>{selectedId ? "Consolidado seleccionado" : "Consolidado actual"}</p>
            <h2 id="consolidado-title" className={styles.heroTitle}>
              Consolidado #{campaign.number}
              <span className={styles.heroName}>{campaign.name}</span>
            </h2>
            <div className={styles.heroStatus}>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span>{status.description}</span>
            </div>
            <p className={styles.heroConsequence}>{status.publicConsequence}</p>
            <p className={styles.heroDates}>
              Apertura: {campaign.opens_at ? formatLimaDateTime(campaign.opens_at) : "sin fecha"} · Cierre: {campaign.closes_at ? formatLimaDateTime(campaign.closes_at) : "sin fecha"}
            </p>
            <div className={styles.heroLinks}>
              <ActionLink href={`/admin/import/consolidados/${campaign.id}`} variant="quiet">
                {isAdmin ? "Editar consolidado" : "Ver consolidado"}
              </ActionLink>
              <ActionLink href="/admin/import/consolidados" variant="quiet">Cambiar de consolidado</ActionLink>
            </div>
          </div>

          {preparing ? (
            nextAction ? (
              <div className={styles.nextStep}>
                <p className={styles.heroEyebrow}>Siguiente paso</p>
                <strong className={styles.nextTitle}>{nextAction.title}</strong>
                <p>{nextAction.detail}</p>
                <ActionLink href={nextAction.href} variant="primary">{nextAction.actionLabel}</ActionLink>
              </div>
            ) : steps.some((step) => step.state === "unknown") ? (
              <div className={styles.nextStep}>
                <p className={styles.heroEyebrow}>Siguiente paso</p>
                <strong className={styles.nextTitle}>Sin verificar</strong>
                <p>No pudimos confirmar el estado de preparación. Recarga la página antes de continuar.</p>
              </div>
            ) : (
              <div className={styles.nextStep}>
                <p className={styles.heroEyebrow}>Siguiente paso</p>
                <strong className={styles.nextTitle}>Nada pendiente en la preparación</strong>
                <p>Revisa abajo los pedidos y la atención a clientes.</p>
              </div>
            )
          ) : (
            <div className={styles.nextStep}>
              <p className={styles.heroEyebrow}>Siguiente paso</p>
              <strong className={styles.nextTitle}>Preparar el próximo consolidado</strong>
              <p>Este consolidado ya no recibe solicitudes. Crea o selecciona el siguiente desde Consolidados.</p>
              <ActionLink href="/admin/import/consolidados" variant="primary">Ir a Consolidados</ActionLink>
            </div>
          )}
        </section>
      ) : !loadFailed ? (
        <Notice
          tone="attention"
          title="Todavía no hay un consolidado activo"
          action={<ActionLink href={isAdmin ? "/admin/import/consolidados/nuevo" : "/admin/import/consolidados"} variant="primary">{isAdmin ? "Crear consolidado" : "Ver consolidados"}</ActionLink>}
        >
          Sin un consolidado, tus clientes no pueden ver productos ni enviar solicitudes.
        </Notice>
      ) : null}

      {campaign && preparing && steps.length > 0 ? (
        <AdminSection
          id="preparacion"
          title="Preparación del consolidado"
          description="Cada paso se calcula con los datos actuales del consolidado. Nada se marca como completo sin verificarlo."
        >
          <Checklist
            label={`Preparación del consolidado #${campaign.number}`}
            rows={steps.map((step) => ({
              key: step.id,
              title: step.title,
              state: step.state,
              stateLabel: CHECKLIST_STATE_LABELS[step.state],
              detail: step.detail,
              href: step.href,
              actionLabel: step.actionLabel,
            }))}
          />
        </AdminSection>
      ) : null}

      <AdminSection id="vista-cliente" title="Qué ven tus clientes ahora">
        <div className={styles.customerView}>
          {customerView.kind === "unknown" ? (
            <p><StatusBadge tone="attention">Sin verificar</StatusBadge> No se pudo consultar el estado público de la tienda.</p>
          ) : customerView.kind === "this" ? (
            <>
              <p><StatusBadge tone="healthy">Catálogo visible</StatusBadge> Tus clientes ven el Consolidado #{campaign?.number} y pueden enviar solicitudes.</p>
              {customerView.visibleProducts !== null ? (
                <p className={styles.customerDetail}>{n(customerView.visibleProducts, "producto visible", "productos visibles")} en el catálogo público.</p>
              ) : null}
            </>
          ) : customerView.kind === "other" ? (
            <p><StatusBadge tone="attention">Otro consolidado</StatusBadge> Tus clientes ven el Consolidado #{customerView.number} ({customerView.name}), no el que estás revisando.</p>
          ) : (
            <>
              <p><StatusBadge tone="neutral">Catálogo cerrado</StatusBadge> La tienda muestra: “El próximo consolidado se está preparando.” Tus clientes todavía no pueden ver productos ni enviar solicitudes.</p>
              {customerView.reason ? <p className={styles.customerDetail}>{customerView.reason}</p> : null}
            </>
          )}
          <ActionLink href="/import" external>Ver Cruzial Import</ActionLink>
        </div>
      </AdminSection>

      <AdminSection
        id="operacion"
        title="Pedidos y atención"
        description="Pendientes con tus clientes, separados de la preparación del consolidado."
      >
        {operational.length > 0 ? (
          <AttentionList items={operational} label="Pendientes de Cruzial Import" />
        ) : loadFailed ? null : (
          <EmptyState title="No hay pendientes con clientes en este momento.">
            No hay solicitudes, pedidos por completar, clientes por verificar ni reclamos nuevos.
          </EmptyState>
        )}
      </AdminSection>
    </AdminPage>
  );
}
