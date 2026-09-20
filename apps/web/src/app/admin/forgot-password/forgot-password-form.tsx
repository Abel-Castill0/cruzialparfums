"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";
import styles from "../auth-shared.module.css";

const initialState: ForgotPasswordState = { message: "" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.message) {
    return <p className={styles.success}>{state.message}</p>;
  }

  return (
    <form className={styles.form} action={formAction}>
      <label className={styles.field}>
        <span>Correo</span>
        <input type="email" name="email" autoComplete="username" required disabled={pending} />
      </label>

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Enviando…" : "Enviar instrucciones"}
      </button>
    </form>
  );
}
