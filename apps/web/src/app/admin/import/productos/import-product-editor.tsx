"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { SaveStatus, StatusBadge, adminButtonClass, type SaveStatusState } from "@/components/admin/admin-ui";
import { AVAILABILITY_LABELS, type CampaignProductAvailability } from "@/domains/admin-import/campaign-products-schema";
import type { ImportProductDetail } from "@/domains/admin-import/catalog-repository";
import { PRESENTATION_CLASS_LABELS, PRESENTATION_STATUS_LABELS, PRODUCT_STATUS_LABELS } from "@/domains/admin-import/catalog-schema";
import {
  createImportPresentationAction,
  lifecycleImportPresentationAction,
  lifecycleImportProductAction,
  updateImportPresentationAction,
  updateImportProductAction,
} from "./actions";
import { PresentationOfferForm } from "./presentation-offer-form";
import styles from "@/components/admin/catalog-workspace.module.css";
import workspace from "@/components/admin/order-workspace.module.css";

function failure(r: { message: string; errors?: Record<string, string> }): string {
  return `${r.message}${r.errors ? ` ${Object.values(r.errors).join(" ")}` : ""} No se guardó.`;
}

// ---------------------------------------------------------------------------
// Global product data — applies in every consolidado.
// ---------------------------------------------------------------------------

export function ImportProductDataForm({ detail, readOnly }: { detail: ImportProductDetail; readOnly: boolean }) {
  const router = useRouter();
  const [productVersion, setProductVersion] = useState(detail.product.updated_at);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatusState>("idle");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const locked = readOnly || !!detail.product.archived_at;

  const submit = (form: FormData) =>
    start(async () => {
      setStatus("saving");
      try {
        const r = await updateImportProductAction(detail.product.id, productVersion, Object.fromEntries(form));
        if (r.ok) {
          setProductVersion(r.updatedAt);
          setStatus("saved");
          setMessage("Datos del producto guardados");
          router.refresh();
        } else {
          setStatus("error");
          setMessage(failure(r));
        }
      } catch {
        setStatus("error");
        setMessage("No pudimos confirmar el guardado. Recarga antes de volver a intentarlo.");
      }
    });

  return (
    <form
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
      onChange={() => {
        setStatus("dirty");
        setMessage(undefined);
      }}
    >
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Nombre</span>
          <input name="name" defaultValue={detail.product.name} disabled={locked} required maxLength={180} />
        </label>
        <label className={styles.field}>
          <span>Marca</span>
          <input name="brand" defaultValue={detail.product.brand ?? ""} disabled={locked} maxLength={120} />
        </label>
        <label className={styles.field}>
          <span>Categoría Import</span>
          <select name="categoryId" defaultValue={detail.category?.id ?? ""} disabled={locked}>
            <option value="">Sin categoría confirmada</option>
            {detail.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Publicación</span>
          <select name="publicationStatus" defaultValue={detail.product.publication_status} disabled={locked}>
            {(["draft", "published", "hidden"] as const).map((s) => <option key={s} value={s}>{PRODUCT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      {!locked ? (
        <div className={styles.actionsRow}>
          <button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Guardando…" : "Guardar producto"}</button>
          <SaveStatus state={status} message={message} />
        </div>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Presentations — global structure (no price here).
// ---------------------------------------------------------------------------

export function ImportPresentations({ detail, readOnly }: { detail: ImportProductDetail; readOnly: boolean }) {
  const locked = readOnly || !!detail.product.archived_at;
  return (
    <div className={styles.cards}>
      {detail.presentations.length === 0 ? (
        <p className={styles.muted}>Este producto todavía no tiene presentaciones.</p>
      ) : (
        detail.presentations.map((p) => <PresentationCard key={p.id} productId={detail.product.id} presentation={p} readOnly={locked} />)
      )}
      {!locked ? <CreatePresentation productId={detail.product.id} /> : null}
    </div>
  );
}

function PresentationCard({
  productId,
  presentation: p,
  readOnly,
}: {
  productId: string;
  presentation: ImportProductDetail["presentations"][number];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(p.updated_at);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatusState>("idle");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archived = !!p.archived_at;
  const locked = readOnly || archived;

  const run = (work: () => Promise<{ ok: true; updatedAt: string } | { ok: false; message: string; errors?: Record<string, string> }>, okMessage: string) =>
    start(async () => {
      setStatus("saving");
      try {
        const r = await work();
        if (r.ok) {
          setVersion(r.updatedAt);
          setStatus("saved");
          setMessage(okMessage);
          setConfirmArchive(false);
          router.refresh();
        } else {
          setStatus("error");
          setMessage(failure(r));
        }
      } catch {
        setStatus("error");
        setMessage("No pudimos confirmar el cambio. Recarga antes de volver a intentarlo.");
      }
    });

  return (
    <article className={`${styles.card} ${p.publication_status !== "published" && !archived ? styles.cardAttention : ""}`}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{p.label}</h3>
        <StatusBadge tone={archived ? "neutral" : p.publication_status === "published" ? "healthy" : "attention"}>
          {archived ? "Archivada" : PRESENTATION_STATUS_LABELS[p.publication_status as keyof typeof PRESENTATION_STATUS_LABELS] ?? "Estado desconocido"}
        </StatusBadge>
      </div>
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() => updateImportPresentationAction(productId, p.id, version, Object.fromEntries(form)), "Presentación guardada");
        }}
        onChange={() => {
          setStatus("dirty");
          setMessage(undefined);
        }}
      >
        <label className={styles.field}><span>Etiqueta</span><input name="label" defaultValue={p.label} disabled={locked} /></label>
        <label className={styles.field}>
          <span>Clase</span>
          <select name="presentationClass" defaultValue={p.presentation_class} disabled={locked}>
            {Object.entries(PRESENTATION_CLASS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Capacidad (ml)</span><input name="capacityMl" inputMode="decimal" defaultValue={p.capacity_ml ?? ""} disabled={locked} /></label>
        <label className={styles.field}>
          <span>Publicación</span>
          <select name="publicationStatus" defaultValue={p.publication_status} disabled={locked}>
            <option value="draft">{PRESENTATION_STATUS_LABELS.draft}</option>
            <option value="published">{PRESENTATION_STATUS_LABELS.published}</option>
          </select>
        </label>
        {!locked ? <button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending ? "Guardando…" : "Guardar presentación"}</button> : null}
      </form>
      <div className={styles.actionsRow}>
        <SaveStatus state={status} message={message} />
      </div>
      {!readOnly ? (
        archived ? (
          <div>
            <button type="button" className={adminButtonClass("quiet")} disabled={pending} onClick={() => run(() => lifecycleImportPresentationAction(productId, p.id, version, true), "Presentación restaurada como borrador")}>
              Restaurar como borrador
            </button>
          </div>
        ) : confirmArchive ? (
          <div className={workspace.dangerConfirm} role="group" aria-label={`Confirmar archivo de ${p.label}`}>
            <strong className={workspace.dangerTitle}>Archivar “{p.label}”: ¿confirmas?</strong>
            <p className={workspace.consequence}>Deja de estar activa y no se ofrece a tus clientes. Los pedidos existentes no cambian.</p>
            <div className={workspace.dangerButtons}>
              <button type="button" className={adminButtonClass("danger")} disabled={pending} onClick={() => run(() => lifecycleImportPresentationAction(productId, p.id, version, false), "Presentación archivada")}>
                Sí, archivar
              </button>
              <button type="button" className={adminButtonClass("quiet")} disabled={pending} onClick={() => setConfirmArchive(false)}>Volver sin cambios</button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" className={adminButtonClass("quiet")} disabled={pending} onClick={() => setConfirmArchive(true)}>Archivar presentación…</button>
          </div>
        )
      ) : null}
    </article>
  );
}

function CreatePresentation({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatusState>("idle");
  const [message, setMessage] = useState<string | undefined>(undefined);
  return (
    <form
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        start(async () => {
          setStatus("saving");
          try {
            const r = await createImportPresentationAction(productId, Object.fromEntries(data));
            if (r.ok) {
              setStatus("saved");
              setMessage("Presentación creada en borrador");
              form.reset();
              router.refresh();
            } else {
              setStatus("error");
              setMessage(failure(r));
            }
          } catch {
            setStatus("error");
            setMessage("No pudimos confirmar la creación. Recarga antes de volver a intentarlo.");
          }
        });
      }}
    >
      <h3 className={styles.cardTitle}>Nueva presentación</h3>
      <div className={styles.formGrid}>
        <label className={styles.field}><span>Etiqueta</span><input name="label" required /></label>
        <label className={styles.field}>
          <span>Clase</span>
          <select name="presentationClass" defaultValue="single_fixed">
            {Object.entries(PRESENTATION_CLASS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Capacidad (ml, opcional)</span><input name="capacityMl" inputMode="decimal" /></label>
        <button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending ? "Creando…" : "Crear en borrador"}</button>
      </div>
      <SaveStatus state={status} message={message} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// This consolidado — price and availability per presentation.
// ---------------------------------------------------------------------------

export function ImportCampaignOffers({ detail, readOnly }: { detail: ImportProductDetail; readOnly: boolean }) {
  const campaignId = detail.activeCampaignId;
  const campaignNumber = detail.activeCampaignNumber;
  const campaignVersion = detail.activeCampaignUpdatedAt;
  const active = detail.presentations.filter((p) => !p.archived_at);
  if (!campaignId || campaignNumber === null) {
    return <p className={styles.muted}>Selecciona un consolidado para gestionar precio y disponibilidad.</p>;
  }
  return (
    <div className={styles.cards}>
      {active.length === 0 ? <p className={styles.muted}>No hay presentaciones activas para ofrecer en este consolidado.</p> : null}
      {active.map((p) => {
        const availability = p.offer?.availability_status as CampaignProductAvailability | undefined;
        const unconfirmed = availability === "unconfirmed";
        return (
          <article key={p.id} className={`${styles.card} ${!p.offer || unconfirmed ? styles.cardAttention : ""}`}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>{p.label}</h3>
              {p.offer ? (
                <span className={styles.headerBadges}>
                  <span>{p.offer.currency} {p.offer.price_amount}</span>
                  <StatusBadge tone={unconfirmed ? "attention" : availability === "available" ? "healthy" : "neutral"}>
                    {availability ? AVAILABILITY_LABELS[availability] ?? "Sin confirmar" : "Sin confirmar"}
                  </StatusBadge>
                </span>
              ) : (
                <StatusBadge tone="attention">Sin oferta</StatusBadge>
              )}
            </div>
            {unconfirmed ? (
              <p className={styles.consequence}>
                Este producto no puede aparecer en el catálogo de este consolidado hasta que confirmes su disponibilidad.
              </p>
            ) : null}
            {!p.offer ? (
              <p className={styles.muted}>
                No tiene precio en el Consolidado #{campaignNumber}. Las ofertas nuevas se agregan desde el consolidado.{" "}
                <Link href={`/admin/import/consolidados/${campaignId}#productos` as Route}>Ir al consolidado</Link>
              </p>
            ) : campaignVersion && !readOnly && !p.archived_at && !detail.product.archived_at ? (
              <PresentationOfferForm
                key={campaignVersion}
                campaignId={campaignId}
                version={campaignVersion}
                productId={detail.product.id}
                presentationId={p.id}
                price={String(p.offer.price_amount)}
                currency={p.offer.currency}
                availability={p.offer.availability_status}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive — secondary, confirmed.
// ---------------------------------------------------------------------------

export function ImportProductArchive({ detail }: { detail: ImportProductDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = !!detail.product.archived_at;
  const toggle = () =>
    start(async () => {
      setError(null);
      try {
        const r = await lifecycleImportProductAction(detail.product.id, detail.product.updated_at, archived);
        if (r.ok) {
          setConfirm(false);
          router.refresh();
        } else setError(failure(r));
      } catch {
        setError("No pudimos confirmar el cambio. Recarga antes de volver a intentarlo.");
      }
    });
  return (
    <div className={styles.card}>
      {error ? <p className={workspace.feedbackError} role="alert">{error}</p> : null}
      {archived ? (
        <>
          <p className={styles.muted}>Este producto está archivado. Restaurarlo lo devuelve como borrador; no se publica automáticamente.</p>
          <div><button type="button" className={adminButtonClass("secondary")} disabled={pending} onClick={toggle}>{pending ? "Restaurando…" : "Restaurar como borrador"}</button></div>
        </>
      ) : confirm ? (
        <div className={workspace.dangerConfirm} role="group" aria-label="Confirmar archivo del producto">
          <strong className={workspace.dangerTitle}>Archivar producto: ¿confirmas?</strong>
          <p className={workspace.consequence}>Deja de aparecer en todos los consolidados y en las listas activas. Los pedidos existentes no cambian.</p>
          <div className={workspace.dangerButtons}>
            <button type="button" className={adminButtonClass("danger")} disabled={pending} onClick={toggle}>{pending ? "Archivando…" : "Sí, archivar producto"}</button>
            <button type="button" className={adminButtonClass("quiet")} disabled={pending} onClick={() => setConfirm(false)}>Volver sin cambios</button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.muted}>Úsalo solo para productos que ya no vas a ofrecer.</p>
          <div><button type="button" className={adminButtonClass("danger")} disabled={pending} onClick={() => setConfirm(true)}>Archivar producto</button></div>
        </>
      )}
    </div>
  );
}
