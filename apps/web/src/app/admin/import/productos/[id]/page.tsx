import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  BackLink,
  Disclosure,
  FactList,
  MetricStrip,
  NextStepCard,
  Notice,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { AdminImportCatalogRepository } from "@/domains/admin-import/catalog-repository";
import { AdminParfumsMediaRepository } from "@/domains/admin-parfums/media-repository";
import { PRODUCT_STATUS_LABELS, PRODUCT_VERIFICATION_LABELS } from "@/domains/admin-import/catalog-schema";
import { campaignStatusPresentation } from "@/domains/admin-import/campaign-presentation";
import { assessImportProduct } from "@/domains/admin-import/product-presentation";
import {
  ImportCampaignOffers,
  ImportPresentations,
  ImportProductArchive,
  ImportProductDataForm,
} from "../import-product-editor";
import { readCloudinaryEnv } from "@/lib/media/cloudinary-env";
import { ImportMediaManager } from "../import-media-manager";
import styles from "@/components/admin/catalog-workspace.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Detalle producto Import" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await getAdminSession();
  if (s.status === "signed_out") redirect("/admin/login");
  if (s.status !== "ok") redirect("/admin");
  const m = s.session.memberships.find((x) => x.businessUnitCode === "import");
  if (!m) redirect("/admin");
  const c = await createSupabaseServerClient();
  if (!c) redirect("/admin");
  const { id } = await params;
  const rawParams = await searchParams;
  const readOnly = m.role === "viewer";

  // The campaign context is whatever the caller (Productos/Publicacion deep
  // link) explicitly selected via ?campaign=. Only when NONE is supplied do
  // we default to the latest non-archived campaign, for convenience — a
  // campaign chosen upstream is NEVER silently re-inferred to something else.
  const requestedCampaignId = typeof rawParams.campaign === "string" ? rawParams.campaign : null;
  let campaignId = requestedCampaignId;
  let defaulted = false;
  if (!campaignId) {
    const defaultCampaign = await c
      .from("campaigns")
      .select("id")
      .eq("business_unit_id", m.businessUnitId)
      .is("archived_at", null)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    campaignId = defaultCampaign.data?.id ?? null;
    defaulted = campaignId !== null;
  }

  const catalogRepo = new AdminImportCatalogRepository(c, m.businessUnitId);
  const mediaRepo = new AdminParfumsMediaRepository(c);
  const [r, mr, campaignResult] = await Promise.all([
    catalogRepo.get(id, campaignId),
    mediaRepo.listForProduct(id),
    campaignId
      ? c.from("campaigns").select("id,number,name,status").eq("business_unit_id", m.businessUnitId).eq("id", campaignId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const listHref = campaignId ? `/admin/import/productos?campaign=${campaignId}` : "/admin/import/productos";

  if (!r.ok) {
    if (r.error.type === "not_found") notFound();
    return (
      <AdminPage>
        <div>
          <BackLink href={listHref}>Productos</BackLink>
          <AdminPageHeader eyebrow="Cruzial Import · Producto" title="Producto" />
        </div>
        <Notice tone="danger" title="No pudimos cargar este producto">Recarga la página. No hagas cambios hasta que cargue completo.</Notice>
      </AdminPage>
    );
  }

  const d = r.data;
  const media = mr.ok ? mr.data : [];
  const campaign = campaignResult.data ?? null;
  const assessment = assessImportProduct(d, campaign);
  const campaignPresentation = campaign ? campaignStatusPresentation(campaign.status) : null;
  const status = d.product.publication_status as keyof typeof PRODUCT_STATUS_LABELS;
  const archived = !!d.product.archived_at;

  return (
    <AdminPage width="wide">
      <div>
        <BackLink href={listHref}>Productos</BackLink>
        <AdminPageHeader
          eyebrow="Cruzial Import · Producto"
          title={d.product.name}
          description={`${d.product.brand ?? "Sin marca"} · ${d.category?.name ?? "Sin categoría"}`}
          meta={readOnly ? "Acceso de solo lectura: puedes consultar este producto, pero no modificarlo." : undefined}
          actions={
            <div className={styles.headerBadges}>
              <StatusBadge tone={archived ? "neutral" : status === "published" ? "healthy" : "attention"}>
                {archived ? "Archivado" : PRODUCT_STATUS_LABELS[status] ?? "Estado desconocido"}
              </StatusBadge>
            </div>
          }
        />
      </div>

      {campaign === null && campaignId !== null ? (
        <Notice tone="attention" title="No encontramos el consolidado del enlace">
          Puede estar archivado. Vuelve a Productos y elige un consolidado.
        </Notice>
      ) : null}

      <section className={styles.summary} aria-labelledby="product-status-title">
        <div className={styles.summaryMain}>
          <h2 id="product-status-title" className={styles.eyebrow}>
            {campaign ? `Qué ven tus clientes en el Consolidado #${campaign.number}` : "Qué ven tus clientes"}
          </h2>
          <p className={styles.headline}>{assessment.headline}</p>
          <p className={styles.consequence}>{assessment.consequence}</p>
          {campaign && campaignPresentation ? (
            <p className={styles.headerBadges}>
              <StatusBadge tone={campaignPresentation.tone}>{campaignPresentation.label}</StatusBadge>
              <span className={styles.muted}>
                {campaign.name}
                {defaulted ? " · consolidado más reciente, porque el enlace no indicaba uno" : ""}
              </span>
            </p>
          ) : null}
          {assessment.readiness.blockers.length > 0 && campaign ? (
            <ul className={styles.muted}>
              {assessment.readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          ) : null}
        </div>
        <div className={styles.summaryNext}>
          {assessment.nextStep ? (
            <NextStepCard title={assessment.nextStep.title} tone="attention">
              <p>{assessment.nextStep.detail}</p>
              <ActionLink href={assessment.nextStep.href} variant="primary">{readOnly ? "Ver detalle" : assessment.nextStep.actionLabel}</ActionLink>
            </NextStepCard>
          ) : assessment.inCatalog ? (
            <NextStepCard title="Nada pendiente" tone="healthy">
              <p>Este producto está listo en este consolidado.</p>
            </NextStepCard>
          ) : archived ? (
            <NextStepCard title="Producto archivado" tone="neutral"><p>No aparece en ningún consolidado.</p></NextStepCard>
          ) : null}
        </div>
      </section>

      {campaign ? (
        <MetricStrip
          label={`Ofertas del producto en el Consolidado #${campaign.number}`}
          items={[
            { key: "presentations", label: "Presentaciones activas", value: assessment.counts.active },
            { key: "published", label: "Presentaciones publicadas", value: assessment.counts.published },
            { key: "offers", label: "Con oferta en este consolidado", value: assessment.counts.offers },
            { key: "unconfirmed", label: "Sin confirmar", value: assessment.counts.unconfirmed, ...(assessment.counts.unconfirmed > 0 ? { tone: "attention" as const } : {}) },
          ]}
        />
      ) : null}

      <div id="datos" className={styles.anchor}>
        <AdminSection id="datos-producto" title="Datos del producto" description="Se aplican al producto en todos los consolidados.">
          <ImportProductDataForm detail={d} readOnly={readOnly} />
        </AdminSection>
      </div>

      <div id="fotos" className={`${styles.anchor} ${styles.legacyReset}`}>
        {mr.ok ? (
          <ImportMediaManager
            productId={d.product.id}
            media={media}
            disabled={readOnly}
            uploadsConfigured={readCloudinaryEnv() !== null}
            productLabel={[d.product.brand, d.product.name].filter(Boolean).join(" ")}
          />
        ) : (
          <Notice tone="attention" title="No pudimos cargar las fotos">Recarga la página antes de subir o cambiar fotos.</Notice>
        )}
      </div>

      <div id="presentaciones" className={styles.anchor}>
        <AdminSection
          id="presentaciones-producto"
          title={`Presentaciones (${d.presentations.length})`}
          description="Formato y publicación de cada presentación, iguales en todos los consolidados. El precio no se define aquí."
        >
          <ImportPresentations detail={d} readOnly={readOnly} />
        </AdminSection>
      </div>

      <div id="consolidado" className={styles.anchor}>
        <AdminSection
          id="consolidado-ofertas"
          title={d.activeCampaignNumber !== null ? `En Consolidado #${d.activeCampaignNumber}` : "En el consolidado"}
          description="Precio y disponibilidad solo para este consolidado."
        >
          <p className={styles.scope}>
            Cambiar el precio o la disponibilidad aquí no modifica el producto ni otros consolidados.
          </p>
          <ImportCampaignOffers detail={d} readOnly={readOnly} />
        </AdminSection>
      </div>

      {!readOnly ? (
        <AdminSection id="mas-acciones" title="Más acciones">
          <ImportProductArchive detail={d} />
        </AdminSection>
      ) : null}

      <Disclosure summary="Ver detalle técnico" hint="Identidad y procedencia del registro">
        <FactList
          items={[
            { term: "Identificador del catálogo", value: d.product.slug },
            { term: "Referencia de origen", value: d.product.legacy_id ?? "No registrada" },
            { term: "Verificación", value: PRODUCT_VERIFICATION_LABELS[d.product.verification_status] ?? d.product.verification_status },
            { term: `Ofertas en consolidado ${d.activeCampaignNumber !== null ? `#${d.activeCampaignNumber}` : "evaluado"}`, value: d.offerCount },
          ]}
        />
        <p className={styles.muted}>Los identificadores de origen se conservan para mantener la trazabilidad del catálogo.</p>
      </Disclosure>
    </AdminPage>
  );
}
