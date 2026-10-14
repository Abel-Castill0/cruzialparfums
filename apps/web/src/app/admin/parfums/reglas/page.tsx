import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage, AdminPageHeader, AdminSection, EmptyState, Notice } from "@/components/admin/admin-ui";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DeliveryZoneRow,
  GiftExclusionForm,
  NewDeliveryZone,
  NewShippingAgency,
  ShippingAgencyRow,
  type GiftCandidate,
} from "./rules-forms";
import styles from "./reglas.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reglas comerciales" };

const ARABIC_SLUGS = ["arab", "arabic"];

export default async function ParfumsCommercialRulesPage() {
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status !== "ok") redirect("/admin");
  const membership = session.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  if (!membership) redirect("/admin");
  const canEdit = membership.role === "admin";
  const unitId = membership.businessUnitId;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Cruzial Parfums" title="Reglas comerciales" />
        <Notice tone="danger" title="El backend de administración no está configurado." />
      </AdminPage>
    );
  }

  const [zonesResult, agenciesResult, ruleResult, categoriesResult] = await Promise.all([
    supabase.from("delivery_zones").select("id,district,is_restricted,updated_at").eq("business_unit_id", unitId).order("district"),
    supabase.from("shipping_agencies").select("id,name,coverage,description,is_active,updated_at").eq("business_unit_id", unitId).order("name"),
    supabase.from("promotion_rules").select("id,conditions,updated_at").eq("business_unit_id", unitId).eq("rule_type", "gift_exclusion").maybeSingle(),
    supabase.from("categories").select("id").eq("business_unit_id", unitId).eq("kind", "commercial_type").in("slug", ARABIC_SLUGS),
  ]);

  if (zonesResult.error || agenciesResult.error || ruleResult.error || categoriesResult.error) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Cruzial Parfums" title="Reglas comerciales" />
        <Notice tone="danger" title="No se pudieron cargar las reglas comerciales">Recarga la página. Si el problema continúa, revisa Operaciones.</Notice>
      </AdminPage>
    );
  }

  const zones = zonesResult.data ?? [];
  const agencies = agenciesResult.data ?? [];
  const rule = ruleResult.data;
  const excluded = ((rule?.conditions as { excluded_product_ids?: unknown } | undefined)?.excluded_product_ids as string[] | undefined) ?? [];

  const categoryIds = (categoriesResult.data ?? []).map((category) => category.id);
  let candidates: GiftCandidate[] = [];
  if (categoryIds.length) {
    const assignments = await supabase.from("product_categories").select("product_id").in("category_id", categoryIds);
    const productIds = [...new Set((assignments.data ?? []).map((row) => row.product_id))];
    if (productIds.length) {
      const products = await supabase
        .from("products")
        .select("id,brand,name,publication_status,archived_at")
        .eq("business_unit_id", unitId)
        .in("id", productIds)
        .order("brand")
        .order("name");
      candidates = (products.data ?? [])
        .filter((product) => (product.publication_status === "published" && product.archived_at === null) || excluded.includes(product.id))
        .map((product) => ({ id: product.id, label: `${product.brand} ${product.name}` }));
    }
  }

  const restricted = zones.filter((zone) => zone.is_restricted).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Cruzial Parfums"
        title="Reglas comerciales"
        description="Zonas del motorizado, agencias de envío y perfumes que no participan en el regalo de 2 ml."
        meta={canEdit ? "Los cambios en las zonas se ven en el checkout en pocos segundos." : "Acceso de solo lectura: un administrador de Parfums puede modificar estas reglas."}
      />

      <AdminSection
        id="zonas"
        title="Zonas del motorizado"
        description="Un distrito marcado «Sin motorizado» solo desactiva esa opción: el cliente elige Shalom y el pedido se registra igual. Nunca se bloquea un pedido."
      >
        {zones.length === 0 ? (
          <Notice tone="attention" title="Todavía no hay distritos cargados">
            Mientras la lista esté vacía, el motorizado se ofrece en todas partes. Se carga cuando el dueño valida la lista propuesta (docs/commercial-rules.md).
          </Notice>
        ) : (
          <p className={styles.summary}>{zones.length} distritos · {zones.length - restricted} con motorizado · {restricted} sin motorizado.</p>
        )}
        <ul className={styles.list}>
          {zones.map((zone) => (
            <DeliveryZoneRow key={zone.id} zone={{ id: zone.id, district: zone.district, isRestricted: zone.is_restricted, updatedAt: zone.updated_at }} canEdit={canEdit} />
          ))}
        </ul>
        {canEdit ? <NewDeliveryZone /> : null}
      </AdminSection>

      <AdminSection id="agencias" title="Agencias de envío" description="Shalom es la agencia vigente: todo el Perú, con el costo cotizado por WhatsApp.">
        {agencies.length === 0 ? <EmptyState title="No hay agencias configuradas" /> : null}
        <ul className={styles.list}>
          {agencies.map((agency) => (
            <ShippingAgencyRow
              key={agency.id}
              agency={{ id: agency.id, name: agency.name, coverage: agency.coverage, description: agency.description ?? "", isActive: agency.is_active, updatedAt: agency.updated_at }}
              canEdit={canEdit}
            />
          ))}
        </ul>
        {canEdit ? <NewShippingAgency /> : null}
      </AdminSection>

      <AdminSection
        id="regalo"
        title="Regalo de 2 ml: perfumes excluidos"
        description="El regalo es un decant de 2 ml de un perfume árabe, solo con la compra de un frasco completo. Los perfumes marcados no se pueden elegir como regalo."
      >
        <GiftExclusionForm
          ruleId={rule?.id ?? ""}
          updatedAt={rule?.updated_at ?? ""}
          candidates={candidates}
          excluded={excluded}
          canEdit={canEdit}
        />
      </AdminSection>
    </AdminPage>
  );
}
