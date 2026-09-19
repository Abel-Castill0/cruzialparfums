"use client";

import { useActionState } from "react";
import { verifyEnrollment, type EnrollVerifyState } from "./actions";
import styles from "../../auth-shared.module.css";

const initialState: EnrollVerifyState = { error: null };

export function MfaEnrollForm({
  factorId,
  qrCode,
  secret,
}: {
  factorId: string;
  qrCode: string;
  secret: string;
}) {
  const [state, formAction, pending] = useActionState(verifyEnrollment, initialState);

  return (
    <form className={styles.form} action={formAction}>
      <div className={styles.qrBlock}>
        {/* Supabase returns the TOTP QR code as an SVG data URL, not raw
            markup — a plain <img> renders it without needing
            dangerouslySetInnerHTML. next/image does not accept data: URLs
            without a configured loader, so a plain <img> is the correct
            tool here, not a workaround. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrCode} alt="Código QR para configurar el autenticador" />
        <span className={styles.secret}>{secret}</span>
      </div>

      <input type="hidden" name="factorId" value={factorId} />

      <label className={styles.field}>
        <span>Código de 6 dígitos</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          name="code"
          autoComplete="one-time-code"
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
        {pending ? "Verificando…" : "Activar verificación en dos pasos"}
      </button>

      <p className={styles.note}>
        Escanea el código QR con tu aplicación de autenticación (Google
        Authenticator, 1Password, Authy, etc.) o ingresa el secreto
        manualmente. Luego escribe el código de 6 dígitos que genera la app.
      </p>
    </form>
  );
}
