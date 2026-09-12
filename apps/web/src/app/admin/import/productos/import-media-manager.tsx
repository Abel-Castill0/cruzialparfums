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
} from "./[id]/media-actions";
import styles from "./page.module.css";

type MediaRow = Database["public"]["Tables"]["product_media"]["Row"];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function uploadToCloudinary(
  file: File,
  auth: { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; allowedFormats: string },
): Promise<CloudinaryUploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", auth.apiKey);
  form.append("timestamp", String(auth.timestamp));
  form.append("signature", auth.signature);
  form.append("folder", auth.folder);
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

export function ImportMediaManager({
  productId,
  media,
  disabled,
}: {
  productId: string;
  media: MediaRow[];
  disabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = media.filter((row) => !row.archived_at).sort((a, b) => a.sort_order - b.sort_order);
  const archived = media.filter((row) => row.archived_at);
  const hasActivePrimary = active.some((row) => row.is_primary);

  function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Solo se aceptan imágenes JPG, PNG o WebP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("La imagen supera el tamaño máximo de 10 MB.");
      return;
    }

    setUploading(true);
    void (async () => {
      try {
        const authResult = await getUploadAuthorizationAction(productId);
        if (authResult.status === "error") {
          setError(authResult.message);
          return;
        }

        const uploaded = await uploadToCloudinary(file, authResult.data);

        const registerResult = await registerMediaAction(
          productId,
          null,
          uploaded,
          null,
          active.length === 0,
        );
        if (registerResult.status === "error") {
          setError(registerResult.message);
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir la imagen.");
      } finally {
        setUploading(false);
      }
    })();
  }

  function move(mediaId: string, direction: -1 | 1) {
    const index = active.findIndex((row) => row.id === mediaId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) return;

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
    });
  }

  function setPrimary(row: MediaRow) {
    startTransition(async () => {
      const result = await setPrimaryMediaAction(row.id, row.updated_at, productId);
      if (result.status === "error") setError(result.message);
    });
  }

  function archive(row: MediaRow) {
    startTransition(async () => {
      const result = await archiveMediaAction(row.id, row.updated_at, productId);
      if (result.status === "error") setError(result.message);
    });
  }

  function restore(row: MediaRow) {
    startTransition(async () => {
      const result = await restoreMediaAction(row.id, row.updated_at, productId);
      if (result.status === "error") setError(result.message);
    });
  }

  function updateAlt(row: MediaRow, alt: string) {
    startTransition(async () => {
      const result = await updateMediaAction(row.id, row.updated_at, productId, alt || null, null);
      if (result.status === "error") setError(result.message);
    });
  }

  function renderCard(row: MediaRow, isArchived: boolean) {
    return (
      <div key={row.id} className={styles.mediaCard} data-archived={isArchived}>
        <div className={styles.mediaThumb}>
          {row.is_primary ? <span className={styles.mediaPrimaryBadge}>Principal</span> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs, not a Next-optimized local asset */}
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
                <button type="button" className={styles.secondaryButton} onClick={() => move(row.id, -1)} disabled={isPending}>
                  ↑
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => move(row.id, 1)} disabled={isPending}>
                  ↓
                </button>
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
        <h2 id="media-title">Media ({active.length})</h2>
      </div>

      {!disabled ? (
        <div className={styles.mediaUploadBar}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Subiendo…" : "Subir imagen"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFilePicked}
            hidden
            aria-label="Seleccionar imagen para subir"
          />
        </div>
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
        <p className={styles.notice}>Este producto todavía no tiene imágenes.</p>
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
