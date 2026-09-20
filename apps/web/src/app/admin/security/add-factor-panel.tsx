"use client";

import { useActionState } from "react";
import {
  beginAddFactor,
  verifyAddFactor,
  type AddFactorState,
  type VerifyAddFactorState,
} from "./actions";
import styles from "../auth-shared.module.css";

const initialAddState: AddFactorState = { status: "idle" };
const initialVerifyState: VerifyAddFactorState = { error: null, success: false };

export function AddFactorPanel() {
  const [state, formAction, pending] = useActionState(beginAddFactor, initialAddState);
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyAddFactor,
    initialVerifyState,
  );

  if (verifyState.success) {
    return <p className={styles.success}>Factor agregado correctamente.</p>;
  }

  if (state.status === "pending") {
    return (
      <form className={styles.form} action={verifyAction}>
        <div className={styles.qrBlock}>
          {/* next/image does not accept data: URLs without a configured
              loader; Supabase's TOTP QR is a data: SVG. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qrCode} alt="Código QR para configurar el nuevo factor" />
          <span className={styles.secret}>{state.secret}</span>
        </div>

        <input type="hidden" name="factorId" value={state.factorId} />

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
            disabled={verifyPending}
          />
        </label>

        {verifyState.error ? (
          <p className={styles.error} role="alert">
            {verifyState.error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={verifyPending}>
          {verifyPending ? "Verificando…" : "Confirmar factor"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction}>
      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={styles.secondary} disabled={pending}>
        {pending ? "Generando…" : "Agregar factor de respaldo"}
      </button>
    </form>
  );
}
