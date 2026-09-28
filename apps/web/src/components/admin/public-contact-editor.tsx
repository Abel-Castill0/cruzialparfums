"use client";

import { useActionState, useState } from "react";
import type { PublicContactSetting } from "@/domains/admin-parfums/settings-repository";
import type { FieldErrors } from "@/domains/admin-parfums/product-schema";
import {
  FactList,
  Notice,
  SaveStatus,
  adminButtonClass,
  type SaveStatusState,
} from "./admin-ui";
import catalogStyles from "./catalog-workspace.module.css";
import styles from "./settings-workspace.module.css";

export type PublicContactSettingActionState =
  | { status: "idle" }
  | { status: "success"; data: PublicContactSetting }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

const initialState: PublicContactSettingActionState = { status: "idle" };

/**
 * Shared by Parfums and Import — presentation only, the same one settings
 * row and RPC per business unit. Reads as the currently effective contact;
 * editing is an explicit mode with Guardar/Cancelar, matching the Mayorista
 * policy editor. Optimistic concurrency: the action is bound to the row's
 * current `updatedAt`, refreshed from every successful save.
 */
export function PublicContactSettingEditor({
  setting,
  canWrite,
  updateAction,
}: {
  setting: PublicContactSetting;
  canWrite: boolean;
  updateAction: (
    expectedUpdatedAt: string,
    previous: PublicContactSettingActionState,
    formData: FormData,
  ) => Promise<PublicContactSettingActionState>;
}) {
  const [current, setCurrent] = useState(setting);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "saved" | "error">("idle");
  const [handledState, setHandledState] = useState<PublicContactSettingActionState>(initialState);
  const boundAction = updateAction.bind(null, current.updatedAt);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "error" || state.status === "field_errors") setFeedback("error");
    if (state.status === "success") {
      setCurrent(state.data);
      setEditing(false);
      setFeedback("saved");
    }
  }

  const errors = state.status === "field_errors" ? state.errors : {};
  const saveState: SaveStatusState = pending ? "saving" : feedback === "error" ? "error" : feedback === "saved" ? "saved" : "idle";
  const saveMessage =
    saveState === "saved"
      ? "Configuración guardada"
      : saveState === "error"
        ? state.status === "error"
          ? `Error — no se guardó. ${state.message}`
          : "Error — no se guardó. Revisa los valores marcados."
        : undefined;

  return (
    <div className={catalogStyles.card}>
      <div className={catalogStyles.cardHead}>
        <h3 className={catalogStyles.cardTitle}>Contacto público</h3>
      </div>
      <p className={styles.groupHint}>
        El WhatsApp y correo que ven tus clientes: encabezado, pie de página, botón de WhatsApp, confirmaciones de
        pedido y páginas de contacto de la tienda.
      </p>

      {!editing ? (
        <>
          <FactList
            items={[
              { term: "WhatsApp", value: `${current.value.whatsappDisplay} (+${current.value.whatsappNumber})` },
              { term: "Correo público", value: current.value.contactEmail },
            ]}
          />
          {canWrite ? (
            <div className={catalogStyles.actionsRow}>
              <button
                type="button"
                className={adminButtonClass("secondary")}
                onClick={() => { setEditing(true); setFeedback("idle"); }}
              >
                Editar
              </button>
              <SaveStatus state={saveState} message={saveMessage} />
            </div>
          ) : null}
        </>
      ) : (
        <form action={formAction} className={catalogStyles.formGrid} aria-busy={pending}>
          {state.status === "error" ? <Notice tone="danger" title="No se guardó">{state.message}</Notice> : null}

          <label className={catalogStyles.field}>
            <span>WhatsApp (E.164, sin &quot;+&quot;)</span>
            <input
              name="whatsappNumber"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={current.value.whatsappNumber}
              disabled={pending}
              aria-invalid={Boolean(errors.whatsappNumber)}
              aria-describedby="whatsappNumber-help"
            />
            <small id="whatsappNumber-help" className={catalogStyles.fieldHint}>Número que recibe los pedidos por WhatsApp (ej. 51926390591).</small>
            {errors.whatsappNumber ? <span className={styles.fieldError}>{errors.whatsappNumber}</span> : null}
          </label>

          <label className={catalogStyles.field}>
            <span>WhatsApp (texto visible)</span>
            <input
              name="whatsappDisplay"
              type="text"
              autoComplete="off"
              defaultValue={current.value.whatsappDisplay}
              disabled={pending}
              aria-invalid={Boolean(errors.whatsappDisplay)}
              aria-describedby="whatsappDisplay-help"
            />
            <small id="whatsappDisplay-help" className={catalogStyles.fieldHint}>Cómo se muestra al público (ej. 926 390 591).</small>
            {errors.whatsappDisplay ? <span className={styles.fieldError}>{errors.whatsappDisplay}</span> : null}
          </label>

          <label className={`${catalogStyles.field} ${styles.fieldFull}`}>
            <span>Correo de contacto público</span>
            <input
              name="contactEmail"
              type="email"
              autoComplete="off"
              defaultValue={current.value.contactEmail}
              disabled={pending}
              aria-invalid={Boolean(errors.contactEmail)}
            />
            {errors.contactEmail ? <span className={styles.fieldError}>{errors.contactEmail}</span> : null}
          </label>

          <div className={`${catalogStyles.actionsRow} ${styles.fieldFull}`}>
            <button className={adminButtonClass("primary")} type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              className={adminButtonClass("quiet")}
              onClick={() => { setEditing(false); setFeedback("idle"); }}
              disabled={pending}
            >
              Cancelar
            </button>
            <SaveStatus state={saveState} message={saveMessage} />
          </div>
        </form>
      )}
    </div>
  );
}
