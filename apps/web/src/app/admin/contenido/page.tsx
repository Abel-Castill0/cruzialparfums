import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage, AdminPageHeader, AdminSection, Notice } from "@/components/admin/admin-ui";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONTENT_PAGE_LABELS, CONTENT_PAGES, CONTENT_SECTIONS, type ContentPageSlug } from "@/lib/content/registry";
import { parseBlockContent } from "@/lib/content/schemas";
import { ContentPageEditor, type AdminContentSection, type ProductCandidate } from "./content-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contenido web" };

type BlockRow = {
  id: string;
  business_unit_id: string;
  page_slug: string;
  section_key: string;
  block_type: string;
  content: unknown;
  is_visible: boolean;
  updated_at: string;
};

type CarouselRow = { business_unit_id: string; carousel_key: string; product_id: string };

/**
 * One editor for every editable text of the storefront. It is deliberately NOT unit-scoped like `/admin/parfums`: a
 * section is only rendered when the signed-in user administers (or can read) the unit that owns it, and each action
 * re-checks the unit server-side. A section with no row shows the copy the page renders today and a "Guardar" creates its
 * first row; "Restablecer" deletes that row and brings the original back.
 */
export default async function ContentAdminPage() {
  const session = await getAdminSession();
  if (session.status === "signed_out") redirect("/admin/login");
  if (session.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (session.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (session.status !== "ok") redirect("/admin");

  const membershipByUnit = new Map(session.session.memberships.map((membership) => [membership.businessUnitCode, membership]));
  const unitIdByCode = new Map(session.session.memberships.map((membership) => [membership.businessUnitCode, membership.businessUnitId]));
  const readableUnitIds = [...new Set(session.session.memberships.map((membership) => membership.businessUnitId))];
  if (readableUnitIds.length === 0) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Contenido" title="Contenido web" />
        <Notice tone="danger" title="El backend de administración no está configurado." />
      </AdminPage>
    );
  }

  const [blocksResult, carouselResult] = await Promise.all([
    supabase
      .from("content_blocks")
      .select("id,business_unit_id,page_slug,section_key,block_type,content,is_visible,updated_at")
      .in("business_unit_id", readableUnitIds),
    supabase
      .from("carousel_items")
      .select("business_unit_id,carousel_key,product_id,display_order")
      .in("business_unit_id", readableUnitIds)
      .order("display_order"),
  ]);

  if (blocksResult.error || carouselResult.error) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow="Contenido" title="Contenido web" />
        <Notice tone="danger" title="No se pudo cargar el contenido">
          Recarga la página. Si el problema continúa, confirma que la migración de contenido esté aplicada.
        </Notice>
      </AdminPage>
    );
  }

  const blockByKey = new Map<string, BlockRow>();
  for (const row of (blocksResult.data ?? []) as BlockRow[]) {
    blockByKey.set(`${row.business_unit_id}:${row.page_slug}:${row.section_key}`, row);
  }

  const carouselByKey = new Map<string, string[]>();
  for (const row of (carouselResult.data ?? []) as CarouselRow[]) {
    const key = `${row.business_unit_id}:${row.carousel_key}`;
    const ordered = carouselByKey.get(key) ?? [];
    ordered.push(row.product_id);
    carouselByKey.set(key, ordered);
  }

  const visibleSections = CONTENT_SECTIONS.filter((section) => membershipByUnit.has(section.unit));

  const carouselUnitIds = [
    ...new Set(
      visibleSections
        .filter((section) => section.blockType === "carousel")
        .map((section) => unitIdByCode.get(section.unit))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let candidates: ProductCandidate[] = [];
  if (carouselUnitIds.length) {
    const productsResult = await supabase
      .from("products")
      .select("id,brand,name")
      .in("business_unit_id", carouselUnitIds)
      .eq("publication_status", "published")
      .is("archived_at", null)
      .order("brand")
      .order("name");
    candidates = (productsResult.data ?? []).map((product) => ({ id: product.id, label: `${product.brand} ${product.name}` }));
  }

  const sections: AdminContentSection[] = visibleSections.map((section) => {
    const membership = membershipByUnit.get(section.unit);
    const unitId = unitIdByCode.get(section.unit);
    const row = unitId ? blockByKey.get(`${unitId}:${section.page}:${section.key}`) ?? null : null;
    const parsed = row && row.block_type === section.blockType ? parseBlockContent(section.blockType, row.content) : null;
    return {
      page: section.page,
      unit: section.unit,
      key: section.key,
      blockType: section.blockType,
      label: section.label,
      description: section.description,
      canEdit: membership?.role === "admin",
      blockId: row?.id ?? null,
      updatedAt: row?.updated_at ?? null,
      isVisible: row?.is_visible ?? true,
      content: parsed ?? null,
      fallback: section.fallback,
      carouselIds: unitId ? carouselByKey.get(`${unitId}:${section.key}`) ?? [] : [],
    };
  });

  const byPage = new Map<ContentPageSlug, AdminContentSection[]>();
  for (const section of sections) {
    const list = byPage.get(section.page) ?? [];
    list.push(section);
    byPage.set(section.page, list);
  }

  const canEditAny = sections.some((section) => section.canEdit);
  const pages = CONTENT_PAGES.filter((page) => byPage.has(page));

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Contenido"
        title="Contenido web"
        description="Edita los textos de la portada, del inicio de Cruzial Parfums y del inicio de Cruzial Import. Lo que no edites se muestra con el texto original de la web."
        meta={
          canEditAny
            ? "Los cambios se ven en la web en pocos segundos."
            : "Acceso de solo lectura: un administrador de la tienda puede modificar este contenido."
        }
      />

      {!canEditAny ? (
        <Notice tone="attention" title="No puedes editar este contenido">
          Tu cuenta no administra las tiendas cuyos textos aparecen aquí. Pide acceso a un administrador.
        </Notice>
      ) : null}

      {pages.length === 0 ? <Notice tone="neutral" title="No hay secciones para tu cuenta." /> : null}

      {pages.map((page) => {
        const pageSections = byPage.get(page) ?? [];
        return (
          <AdminSection key={page} id={`page-${page}`} title={CONTENT_PAGE_LABELS[page]}>
            <ContentPageEditor sections={pageSections} candidates={candidates} />
          </AdminSection>
        );
      })}
    </AdminPage>
  );
}
