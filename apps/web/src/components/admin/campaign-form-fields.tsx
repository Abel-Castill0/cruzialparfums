"use client";

import type { FieldErrors } from "@/domains/admin-parfums/product-schema";
import styles from "./product-form-fields.module.css";

export type CampaignFormDefaults = {
  number: string;
  name: string;
  opensAt: string;
  closesAt: string;
  publicMessage: string;
};

export function CampaignFormFields({
  defaults,
  errors,
  disabled = false,
  numberEditable = true,
}: {
  defaults: CampaignFormDefaults;
  errors: FieldErrors;
  disabled?: boolean;
  /** Kept editable only on create — the number identifies the consolidado. */
  numberEditable?: boolean;
}) {
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Datos del consolidado</legend>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Número *</span>
          <input
            name="number"
            type="number"
            step={1}
            min={1}
            defaultValue={defaults.number}
            required
            disabled={disabled || !numberEditable}
            aria-invalid={!!errors.number}
            aria-describedby={errors.number ? "campaign-error-number" : "campaign-hint-number"}
          />
          {errors.number ? (
            <p id="campaign-error-number" className={styles.error} role="alert">{errors.number}</p>
          ) : (
            <p id="campaign-hint-number" className={styles.hint}>Único dentro de Cruzial Import.</p>
          )}
        </label>

        <label className={styles.field}>
          <span>Nombre *</span>
          <input
            name="name"
            defaultValue={defaults.name}
            required
            maxLength={200}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "campaign-error-name" : undefined}
          />
          {errors.name ? <p id="campaign-error-name" className={styles.error} role="alert">{errors.name}</p> : null}
        </label>

        <label className={styles.field}>
          <span>Apertura (hora de Lima)</span>
          <input
            name="opensAt"
            type="datetime-local"
            defaultValue={defaults.opensAt}
            aria-invalid={!!errors.opensAt}
            aria-describedby={errors.opensAt ? "campaign-error-opensAt" : "campaign-hint-opensAt"}
          />
          {errors.opensAt ? (
            <p id="campaign-error-opensAt" className={styles.error} role="alert">{errors.opensAt}</p>
          ) : (
            <p id="campaign-hint-opensAt" className={styles.hint}>
              Referencial: no abre el consolidado automáticamente. El estado lo cambia un administrador.
            </p>
          )}
        </label>

        <label className={styles.field}>
          <span>Cierre (hora de Lima)</span>
          <input
            name="closesAt"
            type="datetime-local"
            defaultValue={defaults.closesAt}
            aria-invalid={!!errors.closesAt}
            aria-describedby={errors.closesAt ? "campaign-error-closesAt" : "campaign-hint-closesAt"}
          />
          {errors.closesAt ? (
            <p id="campaign-error-closesAt" className={styles.error} role="alert">{errors.closesAt}</p>
          ) : (
            <p id="campaign-hint-closesAt" className={styles.hint}>
              Referencial: no cierra el consolidado automáticamente.
            </p>
          )}
        </label>
      </div>

      <label className={styles.fieldFull}>
        <span>Mensaje público</span>
        <textarea
          name="publicMessage"
          defaultValue={defaults.publicMessage}
          maxLength={2000}
          rows={4}
          aria-invalid={!!errors.publicMessage}
          aria-describedby={errors.publicMessage ? "campaign-error-publicMessage" : "campaign-hint-publicMessage"}
        />
        {errors.publicMessage ? (
          <p id="campaign-error-publicMessage" className={styles.error} role="alert">{errors.publicMessage}</p>
        ) : (
          <p id="campaign-hint-publicMessage" className={styles.hint}>
            Visible solo cuando exista una tienda pública de Import (aún no implementada).
          </p>
        )}
      </label>
    </fieldset>
  );
}
