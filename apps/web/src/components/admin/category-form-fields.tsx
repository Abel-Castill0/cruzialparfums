"use client";

import { useState } from "react";
import type { CategoryKind } from "@/domains/admin-parfums/category-schema";
import type { CategoryParentOption } from "@/domains/admin-parfums/categories-repository";
import type { FieldErrors } from "@/domains/admin-parfums/product-schema";
import styles from "./product-form-fields.module.css";

export type CategoryFormDefaults = {
  kind: CategoryKind;
  slug: string;
  name: string;
  description: string;
  parentId: string;
  publicationStatus: string;
  sortOrder: string;
};

export function CategoryFormFields({
  defaults,
  parentOptions,
  errors,
  disabled = false,
}: {
  defaults: CategoryFormDefaults;
  parentOptions: CategoryParentOption[];
  errors: FieldErrors;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<CategoryKind>(defaults.kind);
  const [parentId, setParentId] = useState(defaults.parentId);
  const availableParents = parentOptions.filter((option) => option.kind === kind);

  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Datos de la categoría</legend>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Nombre *</span>
          <input
            name="name"
            defaultValue={defaults.name}
            required
            maxLength={200}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "category-error-name" : undefined}
          />
          {errors.name ? <p id="category-error-name" className={styles.error} role="alert">{errors.name}</p> : null}
        </label>

        <label className={styles.field}>
          <span>Slug *</span>
          <input
            name="slug"
            defaultValue={defaults.slug}
            required
            maxLength={120}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            aria-invalid={!!errors.slug}
            aria-describedby={errors.slug ? "category-error-slug" : "category-hint-slug"}
          />
          {errors.slug ? (
            <p id="category-error-slug" className={styles.error} role="alert">{errors.slug}</p>
          ) : (
            <p id="category-hint-slug" className={styles.hint}>Minúsculas, números y guiones. No cambia automáticamente con el nombre.</p>
          )}
        </label>

        <label className={styles.field}>
          <span>Tipo *</span>
          <select
            name="kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as CategoryKind);
              setParentId("");
            }}
            aria-invalid={!!errors.kind}
            aria-describedby={errors.kind ? "category-error-kind" : "category-hint-kind"}
          >
            <option value="commercial_type">Tipo comercial</option>
            <option value="olfactory_family">Familia olfativa</option>
          </select>
          {errors.kind ? (
            <p id="category-error-kind" className={styles.error} role="alert">{errors.kind}</p>
          ) : (
            <p id="category-hint-kind" className={styles.hint}>Una categoría hija debe usar el mismo tipo que su padre.</p>
          )}
        </label>

        <label className={styles.field}>
          <span>Categoría padre</span>
          <select
            name="parentId"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            aria-invalid={!!errors.parentId}
            aria-describedby={errors.parentId ? "category-error-parent" : "category-hint-parent"}
          >
            <option value="">Sin padre (categoría raíz)</option>
            {availableParents.map((option) => (
              <option key={option.id} value={option.id}>{option.path}</option>
            ))}
          </select>
          {errors.parentId ? (
            <p id="category-error-parent" className={styles.error} role="alert">{errors.parentId}</p>
          ) : (
            <p id="category-hint-parent" className={styles.hint}>La lista excluye esta categoría y sus descendientes al editar.</p>
          )}
        </label>

        <label className={styles.field}>
          <span>Publicación *</span>
          <select
            name="publicationStatus"
            defaultValue={defaults.publicationStatus}
            aria-invalid={!!errors.publicationStatus}
            aria-describedby={errors.publicationStatus ? "category-error-publication" : undefined}
          >
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
          </select>
          {errors.publicationStatus ? <p id="category-error-publication" className={styles.error} role="alert">{errors.publicationStatus}</p> : null}
        </label>

        <label className={styles.field}>
          <span>Orden</span>
          <input
            name="sortOrder"
            type="number"
            step={1}
            defaultValue={defaults.sortOrder}
            aria-invalid={!!errors.sortOrder}
            aria-describedby={errors.sortOrder ? "category-error-order" : "category-hint-order"}
          />
          {errors.sortOrder ? (
            <p id="category-error-order" className={styles.error} role="alert">{errors.sortOrder}</p>
          ) : (
            <p id="category-hint-order" className={styles.hint}>Los números menores aparecen primero.</p>
          )}
        </label>
      </div>

      <label className={styles.fieldFull}>
        <span>Descripción</span>
        <textarea
          name="description"
          defaultValue={defaults.description}
          maxLength={4000}
          rows={5}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "category-error-description" : undefined}
        />
        {errors.description ? <p id="category-error-description" className={styles.error} role="alert">{errors.description}</p> : null}
      </label>
    </fieldset>
  );
}
