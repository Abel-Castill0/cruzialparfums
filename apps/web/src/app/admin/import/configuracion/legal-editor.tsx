"use client";

import { useActionState, useState } from "react";
import type { BusinessLegalSetting } from "@/domains/admin-parfums/settings-repository";
import {
  updateImportBusinessLegalSettingAction,
  type BusinessLegalSettingActionState,
} from "./actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "./configuracion.module.css";

const initialState: BusinessLegalSettingActionState = { status: "idle" };

export function BusinessLegalSettingEditor({
  setting,
  disabled,
}: {
  setting: BusinessLegalSetting;
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(setting);
  const [handledState, setHandledState] = useState<BusinessLegalSettingActionState>(initialState);
  const boundAction = updateImportBusinessLegalSettingAction.bind(null, current.updatedAt);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setCurrent(state.data);
  }

  const errors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.card} aria-busy={pending}>
      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
      {state.status === "success" ? <p className={styles.success} role="status">Configuración guardada.</p> : null}

      <p className={styles.help}>
        Estos datos aparecen en las páginas legales públicas (privacidad, términos, Libro de Reclamaciones). Déjalos en
        blanco si aún no los tienes — la página pública simplemente omite esa información hasta que la completes.
      </p>

      <div className={formStyles.grid} key={current.updatedAt}>
        <label className={formStyles.field}>
          <span>Razón social</span>
          <input
            name="legalName"
            type="text"
            autoComplete="off"
            defaultValue={current.value.legalName}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.legalName)}
          />
          {errors.legalName ? <small className={formStyles.error} role="alert">{errors.legalName}</small> : null}
        </label>

        <label className={formStyles.field}>
          <span>RUC</span>
          <input
            name="ruc"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={current.value.ruc}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.ruc)}
            aria-describedby="ruc-help"
          />
          <small id="ruc-help" className={styles.help}>11 dígitos, o déjalo en blanco.</small>
          {errors.ruc ? <small className={formStyles.error} role="alert">{errors.ruc}</small> : null}
        </label>

        <label className={formStyles.fieldFull}>
          <span>Dirección para reclamos</span>
          <input
            name="address"
            type="text"
            autoComplete="off"
            defaultValue={current.value.address}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.address)}
          />
          {errors.address ? <small className={formStyles.error} role="alert">{errors.address}</small> : null}
        </label>

        <label className={formStyles.field}>
          <span>Correo para reclamos</span>
          <input
            name="claimsEmail"
            type="email"
            autoComplete="off"
            defaultValue={current.value.claimsEmail}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.claimsEmail)}
          />
          {errors.claimsEmail ? <small className={formStyles.error} role="alert">{errors.claimsEmail}</small> : null}
        </label>

        <label className={formStyles.field}>
          <span>Teléfono para reclamos</span>
          <input
            name="claimsPhone"
            type="text"
            autoComplete="off"
            defaultValue={current.value.claimsPhone}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.claimsPhone)}
          />
          {errors.claimsPhone ? <small className={formStyles.error} role="alert">{errors.claimsPhone}</small> : null}
        </label>

        <label className={formStyles.fieldFull}>
          <span>Política de cambios/devoluciones (texto público)</span>
          <textarea
            name="exchangePolicy"
            rows={5}
            defaultValue={current.value.exchangePolicy}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.exchangePolicy)}
          />
          {errors.exchangePolicy ? <small className={formStyles.error} role="alert">{errors.exchangePolicy}</small> : null}
        </label>

        <label className={formStyles.fieldFull}>
          <span>Nota sobre formas de pago (texto público)</span>
          <textarea
            name="paymentMethodsNote"
            rows={3}
            defaultValue={current.value.paymentMethodsNote}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.paymentMethodsNote)}
          />
          {errors.paymentMethodsNote ? <small className={formStyles.error} role="alert">{errors.paymentMethodsNote}</small> : null}
        </label>
      </div>

      {!disabled ? (
        <button className={styles.saveButton} type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      ) : null}
    </form>
  );
}
