"use client";

import { useActionState } from "react";
import { updateAdminPassword, type ResetPasswordState } from "./actions";
import styles from "../auth-shared.module.css";

const initialState: ResetPasswordState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updateAdminPassword, initialState);

  return (
    <form className={styles.form} action={formAction}>
      <label className={styles.field}>
        <span>Nueva contraseña</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          disabled={pending}
        />
      </label>

      <label className={styles.field}>
        <span>Confirmar contraseña</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={12}
          required
          disabled={pending}
        />
      </label>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Actualizando…" : "Actualizar contraseña"}
      </button>

      <p className={styles.note}>Mínimo 12 caracteres.</p>
    </form>
  );
}
