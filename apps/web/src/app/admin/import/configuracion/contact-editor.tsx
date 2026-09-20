"use client";

import { useActionState, useState } from "react";
import type { PublicContactSetting } from "@/domains/admin-parfums/settings-repository";
import {
  updateImportPublicContactSettingAction,
  type PublicContactSettingActionState,
} from "./actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "./configuracion.module.css";

const initialState: PublicContactSettingActionState = { status: "idle" };

export function PublicContactSettingEditor({
  setting,
  disabled,
}: {
  setting: PublicContactSetting;
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(setting);
  const [handledState, setHandledState] = useState<PublicContactSettingActionState>(initialState);
  const boundAction = updateImportPublicContactSettingAction.bind(null, current.updatedAt);
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

      <div className={formStyles.grid} key={current.updatedAt}>
        <label className={formStyles.field}>
          <span>WhatsApp (E.164, sin &quot;+&quot;)</span>
          <input
            name="whatsappNumber"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={current.value.whatsappNumber}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.whatsappNumber)}
            aria-describedby="whatsappNumber-help"
          />
          <small id="whatsappNumber-help" className={styles.help}>
            Número que recibe los pedidos por WhatsApp, en formato internacional (ej. 51926390591).
          </small>
          {errors.whatsappNumber ? <small className={formStyles.error} role="alert">{errors.whatsappNumber}</small> : null}
        </label>

        <label className={formStyles.field}>
          <span>WhatsApp (texto visible)</span>
          <input
            name="whatsappDisplay"
            type="text"
            autoComplete="off"
            defaultValue={current.value.whatsappDisplay}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.whatsappDisplay)}
            aria-describedby="whatsappDisplay-help"
          />
          <small id="whatsappDisplay-help" className={styles.help}>
            Cómo se muestra el número al público (ej. 926 390 591).
          </small>
          {errors.whatsappDisplay ? <small className={formStyles.error} role="alert">{errors.whatsappDisplay}</small> : null}
        </label>

        <label className={formStyles.fieldFull}>
          <span>Correo de contacto público</span>
          <input
            name="contactEmail"
            type="email"
            autoComplete="off"
            defaultValue={current.value.contactEmail}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.contactEmail)}
            aria-describedby="contactEmail-help"
          />
          <small id="contactEmail-help" className={styles.help}>
            Correo que ve el público en canales de contacto de Import.
          </small>
          {errors.contactEmail ? <small className={formStyles.error} role="alert">{errors.contactEmail}</small> : null}
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
