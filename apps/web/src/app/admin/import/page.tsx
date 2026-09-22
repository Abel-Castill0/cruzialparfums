import type { Metadata, Route } from "next";
import Link from "next/link";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminActionCenter, type AdminActionItem } from "@/components/admin/admin-action-center";
import { AdminParfumsSettingsRepository } from "@/domains/admin-parfums/settings-repository";
import { AdminImportOrdersRepository } from "@/domains/admin-import/orders-repository";
import { AdminImportCustomersRepository } from "@/domains/admin-import/customers-repository";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import { campaignStatusLabel } from "@/domains/admin-import/campaign-schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cruzial Import Admin" };

type ReadinessJson = {
  unconfirmed_offer_count?: number;
  media_blockers?: number;
};

type BlockerRow = { total_count?: number };

// "Hoy": what actually needs a decision right now, not a directory of
// modules or a raw counter dump. Every item is a real query, deep-linked to
// the filtered screen that acts on it; a zero/undetermined count is left
// out rather than shown.
export default async function AdminImportPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const selectedId=typeof params.campaign === "string" && isValidUuid(params.campaign) ? params.campaign : null;
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

  const items: AdminActionItem[] = [];
  let campaignSubtitle = "";

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;

    const [campaignResult, orderCounts, pendingCustomers, contactSetting, complaintCounts] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id,number,status,closes_at")
        .eq("business_unit_id", membership.businessUnitId)
        .or(selectedId ? `id.eq.${selectedId}` : "archived_at.is.null")
        .is("archived_at", null)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      new AdminImportOrdersRepository(supabase, membership.businessUnitId).countByStatus(),
      new AdminImportCustomersRepository(supabase, membership.businessUnitId).countPendingVerification(),
      new AdminParfumsSettingsRepository(supabase, membership.businessUnitId, "import").getPublicContact(),
      new AdminComplaintsRepository(supabase, membership.businessUnitId).countByStatus(),
    ]);

    const campaign = campaignResult.data;
    const pendingOrders = orderCounts?.pending_whatsapp_confirmation ?? 0;
    const confirmedOrders = orderCounts?.confirmed ?? 0;
    const contactConfigured = contactSetting.ok && contactSetting.data !== null;

    if (campaign) {
      campaignSubtitle = `Consolidado #${campaign.number} · ${campaignStatusLabel(campaign.status)}.`;
      items.push({label:`Continuar preparación del consolidado #${campaign.number}`,href:`/admin/import/consolidados/${campaign.id}` as Route});
      if(campaign.closes_at) campaignSubtitle += ` Cierre de solicitudes: ${new Date(campaign.closes_at).toLocaleString("es-PE",{timeZone:"America/Lima",dateStyle:"medium",timeStyle:"short"})}.`;
      const priceResult=await rpc("admin_list_import_publication_blockers",{p_campaign_id:campaign.id,p_blocker:"offer_invalid_price",p_page:1,p_page_size:1});
      const priceCount=((priceResult.data??[]) as BlockerRow[])[0]?.total_count??0;
      if(priceCount>0) items.push({label:`${priceCount} ofertas con precio pendiente de corregir`,href:`/admin/import/publicacion?blocker=offer_invalid_price&campaign=${campaign.id}` as Route,tone:"attention"});

      const [readinessResult, unpublishedResult] = await Promise.all([
        rpc("admin_get_import_publication_readiness", { p_campaign_id: campaign.id }),
        rpc("admin_list_import_publication_blockers", {
          p_campaign_id: campaign.id,
          p_blocker: "product_unpublished",
          p_page: 1,
          p_page_size: 1,
        }),
      ]);
      const readiness = (readinessResult.data ?? {}) as ReadinessJson;
      const campaignParam = `campaign=${campaign.id}`;

      if ((readiness.unconfirmed_offer_count ?? 0) > 0) {
        const n = readiness.unconfirmed_offer_count!;
        items.push({
          label: `${n} oferta${n === 1 ? "" : "s"} del consolidado por confirmar`,
          href: `/admin/import/publicacion?blocker=offer_unconfirmed&${campaignParam}` as Route,
          tone: "attention",
        });
      }
      if ((readiness.media_blockers ?? 0) > 0) {
        const n = readiness.media_blockers!;
        items.push({
          label: `${n} producto${n === 1 ? "" : "s"} sin imagen principal`,
          href: `/admin/import/publicacion?blocker=missing_primary_media&${campaignParam}` as Route,
        });
      }
      // The count here comes from the exact same guarded RPC + p_blocker
      // filter the destination page (?blocker=product_unpublished) queries
      // — never the readiness RPC's broader publication-blockers tally
      // (which also includes presentation_unpublished and could disagree
      // with what the link actually shows).
      const unpublishedRows = (unpublishedResult.data ?? []) as BlockerRow[];
      const unpublishedCount = unpublishedRows[0]?.total_count ?? 0;
      if (unpublishedCount > 0) {
        const n = unpublishedCount;
        items.push({
          label: `${n} producto${n === 1 ? "" : "s"} no publicado${n === 1 ? "" : "s"}`,
          href: `/admin/import/publicacion?blocker=product_unpublished&${campaignParam}` as Route,
        });
      }
    } else {
      campaignSubtitle = "No hay un consolidado activo (no archivado).";
    }

    if (pendingOrders > 0) {
      items.push({
        label: `${pendingOrders} solicitud${pendingOrders === 1 ? "" : "es"} pendiente${pendingOrders === 1 ? "" : "s"} por WhatsApp`,
        href: "/admin/import/pedidos?status=pending_whatsapp_confirmation" as Route,
        tone: "attention",
      });
    }
    if (confirmedOrders > 0) {
      items.push({
        label: `${confirmedOrders} pedido${confirmedOrders === 1 ? "" : "s"} confirmado${confirmedOrders === 1 ? "" : "s"} por completar`,
        href: "/admin/import/pedidos?status=confirmed" as Route,
      });
    }
    if ((pendingCustomers ?? 0) > 0) {
      items.push({
        label: `${pendingCustomers} cliente${pendingCustomers === 1 ? "" : "s"} sin verificar`,
        href: "/admin/import/clientes?status=pending_verification" as Route,
      });
    }
    if (!contactConfigured) {
      items.push({
        label: "Contacto público de WhatsApp sin configurar",
        href: "/admin/import/configuracion" as Route,
        tone: "attention",
      });
    }
    const newComplaints = complaintCounts?.received ?? 0;
    if (newComplaints > 0) {
      items.push({
        label: `${newComplaints} reclamo${newComplaints === 1 ? "" : "s"} nuevo${newComplaints === 1 ? "" : "s"} sin revisar`,
        href: "/admin/import/reclamos?status=received" as Route,
        tone: "attention",
      });
    }
  }

  return (
    <><p style={{padding:"16px 24px"}}><Link href="/admin/import/consolidados">Seleccionar otro consolidado</Link></p><AdminActionCenter
      title="Hoy en Cruzial Import"
      subtitle={campaignSubtitle}
      items={items}
      emptyMessage="No hay acciones pendientes en este momento. Todo lo operativo está al día."
    /></>
  );
}
