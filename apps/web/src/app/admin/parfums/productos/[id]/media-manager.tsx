"use client";

import { useRef, useState, useTransition } from "react";
import type { Database } from "@/lib/supabase/database.types";
import {
  archiveMediaAction,
  getUploadAuthorizationAction,
  registerMediaAction,
  reorderMediaAction,
  restoreMediaAction,
  setPrimaryMediaAction,
  updateMediaAction,
  type CloudinaryUploadResult,
} from "./media-actions";
import catalogStyles from "@/components/admin/catalog-workspace.module.css";
import styles from "../page.module.css";

type MediaRow = Database["public"]["Tables"]["product_media"]["Row"];
type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function uploadToCloudinary(
  file: File,
  auth: { cloudName: string; apiKey: string; timestamp: number; signature: string; publicId: string; allowedFormats: string },
): Promise<CloudinaryUploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", auth.apiKey);
  form.append("timestamp", String(auth.timestamp));
  form.append("signature", auth.signature);
  form.append("public_id", auth.publicId);
  form.append("allowed_formats", auth.allowedFormats);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${auth.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });

  const data = (await response.json()) as {
    public_id?: string;
    secure_url?: string;
    width?: number;
    height?: number;
    bytes?: number;
    format?: string;
    error?: { message: string };
  };

  if (!response.ok || !data.public_id || !data.secure_url || !data.format) {
    throw new Error(data.error?.message ?? "Cloudinary rechazó la subida.");
  }

  return {
    publicId: data.public_id,
    secureUrl: data.secure_url,
    width: data.width ?? null,
    height: data.height ?? null,
    bytes: data.bytes ?? 0,
    format: data.format,
  };
}

export function MediaManager({
  productId,
  media,
  variants,
  disabled,
  uploadsConfigured,
  productLabel,
}: {
  productId: string;
  media: MediaRow[];
  variants: VariantRow[];
  disabled: boolean;
  /** False when this environment has no Cloudinary credentials, so uploads cannot be signed. */
  uploadsConfigured: boolean;
  /** "Brand Name": the default alt text of a new photo, editable afterwards. */
  productLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<Array<{ name: string; status: "pending" | "uploading" | "done" | "error"; message?: string }>>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Same order the storefront uses: the primary first, then the admin's order.
  const active = media
    .filter((row) => !row.archived_at)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  const archived = media.filter((row) => row.archived_at);
  const hasActivePrimary = active.some((row) => row.is_primary);

  /** Uploads one photo end to end and reports why it failed, per file. */
  async function uploadOne(file: File, makePrimary: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, message: "Solo se aceptan imágenes JPG, PNG o WebP." };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Supera el tamaño máximo de 10 MB." };
    try {
      const authResult = await getUploadAuthorizationAction(productId);
      if (authResult.status === "error") return { ok: false, message: authResult.message };

      const uploaded = await uploadToCloudinary(file, authResult.data);
      const registerResult = await registerMediaAction(
        productId,
        null,
        uploaded,
        productLabel,
        makePrimary,
        authResult.data.authorizationToken,
      );
      return registerResult.status === "error" ? { ok: false, message: registerResult.message } : { ok: true };
    } catch (uploadError) {
      return { ok: false, message: uploadError instanceof Error ? uploadError.message : "No se pudo subir la imagen." };
    }
  }

  /** Several photos can be chosen or dropped at once; they upload one after
   * another and a failed file never stops the rest. */
  function uploadFiles(files: File[]) {
    if (files.length === 0 || uploading || disabled || !uploadsConfigured) return;
    setError(null);
    setNotice(null);
    setUploading(true);
    setQueue(files.map((file) => ({ name: file.name, status: "pending" as const })));
    void (async () => {
      let needsPrimary = active.length === 0;
      let uploaded = 0;
      for (const [position, file] of files.entries()) {
        setQueue((current) => current.map((item, i) => (i === position ? { ...item, status: "uploading" as const } : item)));
        const result = await uploadOne(file, needsPrimary);
        if (result.ok) { needsPrimary = false; uploaded += 1; }
        setQueue((current) => current.map((item, i) => (i === position
          ? result.ok ? { ...item, status: "done" as const } : { ...item, status: "error" as const, message: result.message }
          : item)));
      }
      setUploading(false);
      if (uploaded > 0) setNotice(uploaded === 1 ? "1 foto subida." : `${uploaded} fotos subidas.`);
    })();
  }

  function handleFilesPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    uploadFiles(files);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    uploadFiles(Array.from(event.dataTransfer.files));
  }

  // The storefront always shows the primary photo first, so the primary cannot
  // be moved and no other photo can be moved above it.
  const firstMovable = active[0]?.is_primary ? 1 : 0;

  function move(mediaId: string, direction: -1 | 1) {
    const index = active.findIndex((row) => row.id === mediaId);
    const target = index + direction;
    if (index < firstMovable || target < firstMovable || target >= active.length) return;

    const reordered = [...active];
    const moved = reordered.splice(index, 1)[0];
    if (!moved) return;
    reordered.splice(target, 0, moved);

    startTransition(async () => {
      const result = await reorderMediaAction(
        productId,
        reordered.map((row, sortOrder) => ({ id: row.id, sortOrder })),
      );
      if (result.status === "error") setError(result.message);
      else setNotice("Orden guardado. La tienda ya lo muestra.");
    });
  }

  function setPrimary(row: MediaRow) {
    startTransition(async () => {
      const result = await setPrimaryMediaAction(row.id, row.updated_at, productId);
      if (result.status === "error") setError(result.message);
      else setNotice("Foto principal actualizada.");
    });
  }

  function archive(row: MediaRow) {
    startTransition(async () => {
      const result = await archiveMediaAction(row.id, row.updated_at, productId);
      if (result.status === "error") setError(result.message);
      else setNotice("Foto archivada: ya no se muestra en la tienda. Puedes restaurarla abajo.");
    });
  }

  function restore(row: MediaRow) {
    startTransition(async () => {
      const result = await restoreMediaAction(row.id, row.updated_at, productId);
      if (result.status === "error") setError(result.message);
      else setNotice("Foto restaurada.");
    });
  }

  function updateAlt(row: MediaRow, alt: string) {
    startTransition(async () => {
      const result = await updateMediaAction(row.id, row.updated_at, productId, alt || null, row.product_variant_id);
      if (result.status === "error") setError(result.message);
      else setNotice("Texto alternativo guardado.");
    });
  }

  function updateVariant(row: MediaRow, variantId: string) {
    startTransition(async () => {
      const result = await updateMediaAction(row.id, row.updated_at, productId, row.alt, variantId || null);
      if (result.status === "error") setError(result.message);
      else setNotice("Variante asociada guardada.");
    });
  }

  function renderCard(row: MediaRow, isArchived: boolean) {
    return (
      <div key={row.id} className={styles.mediaCard} data-archived={isArchived}>
        <div className={styles.mediaThumb}>
          {row.is_primary ? <span className={styles.mediaPrimaryBadge}>Principal</span> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary/legacy URLs, not a Next-optimized local asset */}
          <img src={row.secure_url} alt={row.alt ?? ""} loading="lazy" />
        </div>

        <p className={styles.mediaMeta}>
          {row.width && row.height ? `${row.width}×${row.height} · ` : ""}
          {row.format?.toUpperCase() ?? "—"} · {formatBytes(row.bytes)}
        </p>

        <div className={styles.mediaField}>
          <label htmlFor={`alt-${row.id}`}>Texto alternativo</label>
          <input
            id={`alt-${row.id}`}
            type="text"
            defaultValue={row.alt ?? ""}
            disabled={disabled || isArchived}
            onBlur={(event) => {
              if (event.target.value !== (row.alt ?? "")) updateAlt(row, event.target.value);
            }}
          />
        </div>

        <div className={styles.mediaField}>
          <label htmlFor={`variant-${row.id}`}>Variante asociada</label>
          <select
            id={`variant-${row.id}`}
            defaultValue={row.product_variant_id ?? ""}
            disabled={disabled || isArchived}
            onChange={(event) => updateVariant(row, event.target.value)}
          >
            <option value="">Sin variante específica</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </select>
        </div>

        {!disabled ? (
          <div className={styles.mediaActions}>
            {isArchived ? (
              <button type="button" className={styles.secondaryButton} onClick={() => restore(row)} disabled={isPending}>
                Restaurar
              </button>
            ) : (
              <>
                {!row.is_primary ? (
                  <button type="button" className={styles.secondaryButton} onClick={() => setPrimary(row)} disabled={isPending}>
                    Marcar como principal
                  </button>
                ) : null}
                {!row.is_primary ? (
                  <>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => move(row.id, -1)}
                      disabled={isPending || active.findIndex((item) => item.id === row.id) <= firstMovable}
                      aria-label="Mover foto antes"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => move(row.id, 1)}
                      disabled={isPending || active.findIndex((item) => item.id === row.id) >= active.length - 1}
                      aria-label="Mover foto después"
                    >
                      ↓
                    </button>
                  </>
                ) : null}
                <button type="button" className={styles.dangerButton} onClick={() => archive(row)} disabled={isPending}>
                  Archivar
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="media-title">
      <div className={styles.sectionTitle}>
        <h2 id="media-title">Fotos ({active.length})</h2>
      </div>
      <p className={catalogStyles.muted}>
        {hasActivePrimary ? "La foto marcada como “Principal” aparece primero en la tienda y en los listados." : "Marca una foto como “Principal” para que sea la que ven tus clientes."}
        {" "}Los clientes ven todas las fotos activas en ese orden; usa ↑ y ↓ para ordenar las demás.
      </p>

      {disabled ? (
        <p className={styles.notice} role="status" data-media-readonly>
          Tu cuenta solo puede ver las fotos. Para subir, ordenar o archivar fotos necesitas el rol de administrador.
        </p>
      ) : !uploadsConfigured ? (
        <p className={styles.conflictBanner} role="status" data-media-unconfigured>
          La subida de fotos no está configurada en este entorno (faltan las credenciales de Cloudinary). Las fotos que ya existen se
          siguen mostrando; para subir nuevas, configura Cloudinary en este entorno.
        </p>
      ) : (
        <div
          className={`${styles.mediaDropzone} ${dragging ? styles.mediaDropzoneActive : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          data-media-dropzone
        >
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Subiendo…" : "Subir imágenes"}
          </button>
          <span>o arrástralas aquí. JPG, PNG o WebP, hasta 10 MB cada una. Puedes elegir varias a la vez.</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFilesPicked}
            hidden
            aria-label="Seleccionar imágenes para subir"
          />
        </div>
      )}

      {queue.length > 0 ? (
        <ul className={styles.mediaQueue} aria-label="Estado de la subida" data-media-queue>
          {queue.map((item, position) => (
            <li key={`${position}-${item.name}`} data-status={item.status}>
              <strong>{item.name}</strong>
              <span>
                {item.status === "pending" ? "En espera" : item.status === "uploading" ? "Subiendo…" : item.status === "done" ? "Subida" : item.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {notice && !error ? (
        <p className={styles.notice} role="status" data-media-notice>
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className={styles.conflictBanner} role="alert">
          {error}
        </p>
      ) : null}

      {active.length > 0 && !hasActivePrimary ? (
        <p className={styles.mediaEmptyPrimary} role="status">
          Este producto no tiene una imagen principal activa. Elige una con &quot;Marcar como principal&quot;.
        </p>
      ) : null}

      {active.length === 0 ? (
        <p className={styles.notice}>Este producto todavía no tiene fotos. {disabled ? "Un administrador puede subirlas." : "Sube fotos reales del producto con “Subir imágenes”; la primera queda como principal y es la que ven tus clientes."}</p>
      ) : (
        <div className={styles.mediaGrid}>{active.map((row) => renderCard(row, false))}</div>
      )}

      {archived.length > 0 ? (
        <details className={styles.notice}>
          <summary>
            {archived.length} imagen{archived.length === 1 ? "" : "es"} archivada{archived.length === 1 ? "" : "s"}
          </summary>
          <div className={styles.mediaGrid}>{archived.map((row) => renderCard(row, true))}</div>
        </details>
      ) : null}
    </section>
  );
}
