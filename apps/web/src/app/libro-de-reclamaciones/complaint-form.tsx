"use client";

import { useCallback, useRef, useState } from "react";
import { submitComplaintAction, type SubmitComplaintResult } from "./actions";
import styles from "./page.module.css";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type FormState =
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; id: string }
  | { phase: "error"; message: string };

export function ComplaintForm({initialUnit = "parfums"}:{initialUnit?:"parfums"|"import"}) {
  const [businessUnit, setBusinessUnit] = useState<"parfums" | "import">(initialUnit);
  const [state, setState] = useState<FormState>({ phase: "form" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isMinor, setIsMinor] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const requestIdRef = useRef<string>(generateUUID());

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFieldErrors({});
      setState({ phase: "submitting" });

      const fd = new FormData(event.currentTarget);
      const input = Object.fromEntries(fd.entries());

      let result: SubmitComplaintResult;
      try { result = await submitComplaintAction(
        businessUnit,
        requestIdRef.current,
        input,
      ); } catch {
        setState({phase:"error",message:"No se pudo confirmar el envío. Conservamos tus datos; vuelve a intentarlo."});
        return;
      }

      if (result.status === "error") {
        setState({ phase: "error", message: result.message });
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      setState({ phase: "success", id: result.id });
    },
    [businessUnit],
  );

  if (state.phase === "success") {
    return (
      <div className={styles.success} role="status">
        <h2>Tu solicitud fue registrada.</h2>
        <p>Número de referencia: <strong>{state.id}</strong></p>
        <p>Te contactaremos usando los datos proporcionados. Conserva este número de referencia.</p>
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => {
            requestIdRef.current = generateUUID();
            setState({ phase: "form" });
            formRef.current?.reset();
            setIsMinor(false);
          }}
        >
          Registrar otra solicitud
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
      {state.phase === "error" ? (
        <p className={styles.errorBanner} role="alert">{state.message}</p>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend>¿A qué unidad de negocio corresponde tu caso?</legend>
        <div className={styles.radioRow}>
          <label>
            <input
              type="radio"
              name="unit"
              checked={businessUnit === "parfums"}
              onChange={() => setBusinessUnit("parfums")}
            />
            Cruzial Parfums
          </label>
          <label>
            <input
              type="radio"
              name="unit"
              checked={businessUnit === "import"}
              onChange={() => setBusinessUnit("import")}
            />
            Cruzial Import
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Tipo de solicitud</legend>
        <div className={styles.radioRow}>
          <label>
            <input type="radio" name="complaintType" value="reclamo" defaultChecked />
            Reclamo (disconformidad con el producto o servicio)
          </label>
          <label>
            <input type="radio" name="complaintType" value="queja" />
            Queja (disconformidad con la atención)
          </label>
        </div>
        {fieldErrors.complaintType ? <p className={styles.fieldError}>{fieldErrors.complaintType}</p> : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Identificación del consumidor</legend>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Nombre completo *</span>
            <input name="fullName" type="text" required aria-invalid={Boolean(fieldErrors.fullName)} />
            {fieldErrors.fullName ? <span className={styles.fieldError}>{fieldErrors.fullName}</span> : null}
          </label>
          <label className={styles.field}>
            <span>Tipo de documento *</span>
            <select name="documentType" defaultValue="dni" aria-invalid={Boolean(fieldErrors.documentType)}>
              <option value="dni">DNI</option>
              <option value="ce">Carné de extranjería</option>
              <option value="pasaporte">Pasaporte</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Número de documento *</span>
            <input name="documentNumber" type="text" required aria-invalid={Boolean(fieldErrors.documentNumber)} />
            {fieldErrors.documentNumber ? <span className={styles.fieldError}>{fieldErrors.documentNumber}</span> : null}
          </label>
          <label className={styles.fieldFull}>
            <span>Dirección *</span>
            <input name="address" type="text" required aria-invalid={Boolean(fieldErrors.address)} />
            {fieldErrors.address ? <span className={styles.fieldError}>{fieldErrors.address}</span> : null}
          </label>
          <label className={styles.field}>
            <span>Teléfono *</span>
            <input name="phone" type="tel" required aria-invalid={Boolean(fieldErrors.phone)} />
            {fieldErrors.phone ? <span className={styles.fieldError}>{fieldErrors.phone}</span> : null}
          </label>
          <label className={styles.field}>
            <span>Correo electrónico *</span>
            <input name="email" type="email" required aria-invalid={Boolean(fieldErrors.email)} />
            {fieldErrors.email ? <span className={styles.fieldError}>{fieldErrors.email}</span> : null}
          </label>
        </div>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            name="isMinor"
            checked={isMinor}
            onChange={(event) => setIsMinor(event.target.checked)}
          />
          El consumidor es menor de edad
        </label>

        {isMinor ? (
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Nombre del apoderado *</span>
              <input name="guardianFullName" type="text" aria-invalid={Boolean(fieldErrors.guardianFullName)} />
              {fieldErrors.guardianFullName ? <span className={styles.fieldError}>{fieldErrors.guardianFullName}</span> : null}
            </label>
            <label className={styles.field}>
              <span>Documento del apoderado *</span>
              <input name="guardianDocumentNumber" type="text" aria-invalid={Boolean(fieldErrors.guardianDocumentNumber)} />
              {fieldErrors.guardianDocumentNumber ? <span className={styles.fieldError}>{fieldErrors.guardianDocumentNumber}</span> : null}
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Detalle</legend>
        <label className={styles.fieldFull}>
          <span>Número de pedido (opcional)</span>
          <input name="orderReference" type="text" maxLength={60} />
        </label>
        <label className={styles.fieldFull}>
          <span>Detalle del reclamo o queja *</span>
          <textarea name="detail" rows={5} required aria-invalid={Boolean(fieldErrors.detail)} />
          {fieldErrors.detail ? <span className={styles.fieldError}>{fieldErrors.detail}</span> : null}
        </label>
        <label className={styles.fieldFull}>
          <span>¿Qué solución esperas? *</span>
          <textarea name="consumerRequest" rows={3} required aria-invalid={Boolean(fieldErrors.consumerRequest)} />
          {fieldErrors.consumerRequest ? <span className={styles.fieldError}>{fieldErrors.consumerRequest}</span> : null}
        </label>
      </fieldset>

      <button type="submit" className={styles.primaryAction} disabled={state.phase === "submitting"}>
        {state.phase === "submitting" ? "Enviando…" : "Registrar solicitud"}
      </button>
    </form>
  );
}
