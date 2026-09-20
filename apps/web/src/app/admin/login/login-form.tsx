"use client";

import { useActionState } from "react";
import { signInAdmin, type LoginState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginState = { error: null };

export function AdminLoginForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(signInAdmin, initialState);

  return (
    <form className={styles.form} action={formAction}>
      <label className={styles.field}>
        <span>Correo</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          disabled={!configured || pending}
        />
      </label>

      <label className={styles.field}>
        <span>Contraseña</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={!configured || pending}
        />
      </label>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={!configured || pending}>
        {pending ? "Verificando…" : "Entrar"}
      </button>

      <p className={styles.note}>
        El acceso es solo para administradores provisionados. No existe registro
        público.
      </p>
    </form>
  );
}
