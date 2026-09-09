"use client";

import { useActionState } from "react";
import { CampaignFormFields } from "@/components/admin/campaign-form-fields";
import { createCampaignAction, type CampaignActionState } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "@/app/admin/parfums/productos/page.module.css";

const initialState: CampaignActionState = { status: "idle" };

export function NewCampaignForm() {
  const [state, formAction, pending] = useActionState(createCampaignAction, initialState);
  const errors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.formWrapper} aria-busy={pending}>
      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
      <CampaignFormFields
        defaults={{ number: "", name: "", opensAt: "", closesAt: "", publicMessage: "" }}
        errors={errors}
        disabled={pending}
      />
      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? "Creando…" : "Crear consolidado (borrador)"}
        </button>
      </div>
    </form>
  );
}
