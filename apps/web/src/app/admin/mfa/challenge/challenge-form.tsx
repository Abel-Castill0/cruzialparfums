"use client";

import { useActionState, useState } from "react";
import { verifyChallenge, type ChallengeState } from "./actions";
import styles from "../../auth-shared.module.css";

const initialState: ChallengeState = { error: null };

export function MfaChallengeForm({
  factors,
}: {
  factors: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(verifyChallenge, initialState);
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");

  return (
    <form className={styles.form} action={formAction}>
      {factors.length > 1 ? (
        <label className={styles.field}>
          <span>Factor de verificación</span>
          <select
            name="factorId"
            value={factorId}
            onChange={(event) => setFactorId(event.target.value)}
            disabled={pending}
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="factorId" value={factorId} />
      )}

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
        {pending ? "Verificando…" : "Verificar"}
      </button>
    </form>
  );
}
