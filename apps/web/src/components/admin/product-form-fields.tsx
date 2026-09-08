"use client";

import type { FieldErrors } from "@/domains/admin-parfums/product-schema";
import styles from "./product-form-fields.module.css";

export type ProductFormDefaults = {
  slug: string;
  name: string;
  brand: string;
  shortDescription: string;
  description: string;
  gender: string;
  concentration: string;
  salesMode: string;
  productionStatus: string;
  publicationStatus: string;
  isFeatured: boolean;
  featuredRank: string;
  featuredFrom: string;
  featuredUntil: string;
};

function toDatetimeLocal(value: string): string {
  if (!value) return "";
  // <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm", not a full ISO
  // string with seconds/timezone.
  return value.slice(0, 16);
}

/** Pure presentational fields, shared by the create and edit pages. The
 * parent supplies the bound Server Action and reads submission state via
 * useActionState — this component holds no mutation logic itself. */
export function ProductFormFields({
  defaults,
  errors,
  disabled,
}: {
  defaults: ProductFormDefaults;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Datos del producto</legend>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Nombre *</span>
          <input name="name" defaultValue={defaults.name} required maxLength={200} aria-invalid={!!errors.name} aria-describedby={errors.name ? "err-name" : undefined} />
          {errors.name ? <p id="err-name" className={styles.error} role="alert">{errors.name}</p> : null}
        </label>

        <label className={styles.field}>
          <span>Slug *</span>
          <input name="slug" defaultValue={defaults.slug} required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-invalid={!!errors.slug} aria-describedby={errors.slug ? "err-slug" : undefined} />
          {errors.slug ? (
            <p id="err-slug" className={styles.error} role="alert">{errors.slug}</p>
          ) : (
            <p className={styles.hint}>Minúsculas, números y guiones. Cambiarlo no actualiza enlaces existentes.</p>
          )}
        </label>

        <label className={styles.field}>
          <span>Marca</span>
          <input name="brand" defaultValue={defaults.brand} maxLength={120} />
        </label>

        <label className={styles.field}>
          <span>Género</span>
          <input name="gender" defaultValue={defaults.gender} maxLength={40} placeholder="unisex, hombre, mujer…" />
        </label>

        <label className={styles.field}>
          <span>Concentración</span>
          <input name="concentration" defaultValue={defaults.concentration} maxLength={40} placeholder="EDP, EDT…" />
        </label>

        <label className={styles.field}>
          <span>Modo de venta</span>
          <select name="salesMode" defaultValue={defaults.salesMode}>
            <option value="always_available">Siempre disponible</option>
            <option value="campaign">Solo por campaña</option>
            <option value="catalog_only">Solo catálogo (sin venta directa)</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Producción</span>
          <select name="productionStatus" defaultValue={defaults.productionStatus}>
            <option value="active">Activo</option>
            <option value="discontinued">Descontinuado</option>
          </select>
          <p className={styles.hint}>Descontinuado no significa agotado — la disponibilidad se gestiona por variante.</p>
        </label>

        <label className={styles.field}>
          <span>Publicación</span>
          <select name="publicationStatus" defaultValue={defaults.publicationStatus}>
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
      </div>

      <label className={styles.fieldFull}>
        <span>Descripción corta</span>
        <input name="shortDescription" defaultValue={defaults.shortDescription} maxLength={300} />
      </label>

      <label className={styles.fieldFull}>
        <span>Descripción</span>
        <textarea name="description" defaultValue={defaults.description} maxLength={4000} rows={4} />
      </label>

      <div className={styles.featuredBlock}>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" name="isFeatured" defaultChecked={defaults.isFeatured} />
          Destacado (aparece en el rail editorial de la Home)
        </label>

        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Orden de destacado</span>
            <input
              name="featuredRank"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.featuredRank}
              aria-invalid={!!errors.featuredRank}
              aria-describedby={errors.featuredRank ? "err-featuredRank" : undefined}
            />
            {errors.featuredRank ? (
              <p id="err-featuredRank" className={styles.error} role="alert">{errors.featuredRank}</p>
            ) : null}
          </label>

          <label className={styles.field}>
            <span>Destacado desde</span>
            <input
              name="featuredFrom"
              type="datetime-local"
              defaultValue={toDatetimeLocal(defaults.featuredFrom)}
            />
          </label>

          <label className={styles.field}>
            <span>Destacado hasta</span>
            <input
              name="featuredUntil"
              type="datetime-local"
              defaultValue={toDatetimeLocal(defaults.featuredUntil)}
              aria-invalid={!!errors.featuredUntil}
              aria-describedby={errors.featuredUntil ? "err-featuredUntil" : undefined}
            />
            {errors.featuredUntil ? (
              <p id="err-featuredUntil" className={styles.error} role="alert">{errors.featuredUntil}</p>
            ) : null}
          </label>
        </div>
      </div>
    </fieldset>
  );
}
