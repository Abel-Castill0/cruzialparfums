"use client";

import { useCallback, useRef, useState } from "react";
import { submitComplaintAction, type SubmitComplaintResult } from "./actions";
import { COMPLAINT_DETAIL_MAX_LENGTH, COMPLAINT_REQUEST_MAX_LENGTH } from "@/domains/complaints/complaint-schema";
import type { BusinessLegalIdentity } from "@/domains/complaints/business-legal-identity";
import type { ComplaintEntry } from "@/domains/complaints/complaint-repository";
import styles from "./page.module.css";

const DOCUMENT_TYPE_LABEL: Record<ComplaintEntry["documentType"], string> = {
  dni: "DNI",
  ce: "Carné de extranjería",
  pasaporte: "Pasaporte",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });
}

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
  | { phase: "success"; entry: ComplaintEntry }
  | { phase: "error"; message: string };

export function ComplaintForm({
  initialUnit = "parfums",
  legalIdentity,
}: {
  initialUnit?: "parfums" | "import";
  legalIdentity: { parfums: BusinessLegalIdentity | null; import: BusinessLegalIdentity | null };
}) {
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

      setState({ phase: "success", entry: result.entry });
    },
    [businessUnit],
  );

  if (state.phase === "success") {
    const entry = state.entry;
    const legal = legalIdentity[businessUnit];
    const unitLabel = businessUnit === "parfums" ? "Cruzial Parfums" : "Cruzial Import";
    return (
      <div className={styles.success} role="status">
        <div className={styles.printArea}>
          <h2>Tu solicitud fue registrada.</h2>
          <p>Conserva esta copia — puedes imprimirla o guardarla como PDF ahora mismo.</p>
          <div className={styles.receipt}>
            <div className={styles.receiptRow}><span>Referencia</span><strong>{entry.id}</strong></div>
            <div className={styles.receiptRow}><span>Fecha</span><span>{formatDateTime(entry.createdAt)}</span></div>
            <div className={styles.receiptRow}><span>Unidad de negocio</span><span>{unitLabel}</span></div>
            <div className={styles.receiptRow}><span>Tipo</span><span>{entry.complaintType === "reclamo" ? "Reclamo" : "Queja"}</span></div>
            <div className={styles.receiptRow}><span>Consumidor</span><span>{entry.fullName}</span></div>
            <div className={styles.receiptRow}><span>Documento</span><span>{DOCUMENT_TYPE_LABEL[entry.documentType]} {entry.documentNumber}</span></div>
            <div className={styles.receiptRow}><span>Dirección</span><span>{entry.address}</span></div>
            <div className={styles.receiptRow}><span>Teléfono</span><span>{entry.phone}</span></div>
            <div className={styles.receiptRow}><span>Correo</span><span>{entry.email}</span></div>
            {entry.isMinor ? (
              <div className={styles.receiptRow}><span>Apoderado</span><span>{entry.guardianFullName} — {entry.guardianDocumentNumber}</span></div>
            ) : null}
            {entry.orderReference ? (
              <div className={styles.receiptRow}><span>Pedido relacionado</span><span>{entry.orderReference}</span></div>
            ) : null}
            <div className={styles.receiptRow}><span>Detalle</span><span>{entry.detail}</span></div>
            <div className={styles.receiptRow}><span>Solución solicitada</span><span>{entry.consumerRequest}</span></div>
            <div className={styles.receiptRow}><span>Plazo de respuesta</span><span>{formatDateTime(entry.dueAt)}</span></div>
          </div>
          {legal ? (
            <div className={styles.legalIdentity}>
              <strong>Proveedor</strong>
              {legal.legalName || "—"}{legal.ruc ? ` · RUC ${legal.ruc}` : ""}
              {legal.address ? <><br />{legal.address}</> : null}
              {legal.claimsEmail ? <><br />{legal.claimsEmail}</> : null}
            </div>
          ) : null}
        </div>
        <div className={styles.receiptActions}>
          <button type="button" className={styles.primaryAction} onClick={() => window.print()}>
            Imprimir / Guardar copia
          </button>
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

      {(() => {
        const legal = legalIdentity[businessUnit];
        const unitLabel = businessUnit === "parfums" ? "Cruzial Parfums" : "Cruzial Import";
        if (legal?.isComplete) {
          return (
            <div className={styles.legalIdentity}>
              <strong>Proveedor</strong>
              {legal.legalName} · RUC {legal.ruc}<br />{legal.address}
            </div>
          );
        }
        return (
          <p className={styles.legalNotice} role="status">
            {unitLabel} aún no completó su identificación legal (razón social, RUC y dirección) en este sistema.
            Puedes registrar tu solicitud igualmente — se procesará con normalidad — y esta información se
            añadirá a tu copia impresa en cuanto esté disponible.
          </p>
        );
      })()}

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
            <input name="fullName" type="text" required maxLength={200} aria-invalid={Boolean(fieldErrors.fullName)} />
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
            <input name="documentNumber" type="text" required maxLength={20} aria-invalid={Boolean(fieldErrors.documentNumber)} />
            {fieldErrors.documentNumber ? <span className={styles.fieldError}>{fieldErrors.documentNumber}</span> : null}
          </label>
          <label className={styles.fieldFull}>
            <span>Dirección *</span>
            <input name="address" type="text" required maxLength={300} aria-invalid={Boolean(fieldErrors.address)} />
            {fieldErrors.address ? <span className={styles.fieldError}>{fieldErrors.address}</span> : null}
          </label>
          <label className={styles.field}>
            <span>Teléfono *</span>
            <input name="phone" type="tel" required aria-invalid={Boolean(fieldErrors.phone)} />
            {fieldErrors.phone ? <span className={styles.fieldError}>{fieldErrors.phone}</span> : null}
          </label>
          <label className={styles.field}>
            <span>Correo electrónico *</span>
            <input name="email" type="email" required maxLength={254} aria-invalid={Boolean(fieldErrors.email)} />
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
              <input name="guardianFullName" type="text" maxLength={200} aria-invalid={Boolean(fieldErrors.guardianFullName)} />
              {fieldErrors.guardianFullName ? <span className={styles.fieldError}>{fieldErrors.guardianFullName}</span> : null}
            </label>
            <label className={styles.field}>
              <span>Documento del apoderado *</span>
              <input name="guardianDocumentNumber" type="text" maxLength={20} aria-invalid={Boolean(fieldErrors.guardianDocumentNumber)} />
              {fieldErrors.guardianDocumentNumber ? <span className={styles.fieldError}>{fieldErrors.guardianDocumentNumber}</span> : null}
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Detalle</legend>
        <label className={styles.fieldFull}>
          <span>Número de pedido (opcional)</span>
          <input name="orderReference" type="text" maxLength={60} aria-invalid={Boolean(fieldErrors.orderReference)} />
          {fieldErrors.orderReference ? <span className={styles.fieldError}>{fieldErrors.orderReference}</span> : null}
        </label>
        <label className={styles.fieldFull}>
          <span>Detalle del reclamo o queja *</span>
          <span id="complaint-detail-limit">Máximo {COMPLAINT_DETAIL_MAX_LENGTH} caracteres.</span>
          <textarea name="detail" rows={5} required maxLength={COMPLAINT_DETAIL_MAX_LENGTH} aria-describedby="complaint-detail-limit" aria-invalid={Boolean(fieldErrors.detail)} />
          {fieldErrors.detail ? <span className={styles.fieldError}>{fieldErrors.detail}</span> : null}
        </label>
        <label className={styles.fieldFull}>
          <span>¿Qué solución esperas? *</span>
          <span id="complaint-request-limit">Máximo {COMPLAINT_REQUEST_MAX_LENGTH} caracteres.</span>
          <textarea name="consumerRequest" rows={3} required maxLength={COMPLAINT_REQUEST_MAX_LENGTH} aria-describedby="complaint-request-limit" aria-invalid={Boolean(fieldErrors.consumerRequest)} />
          {fieldErrors.consumerRequest ? <span className={styles.fieldError}>{fieldErrors.consumerRequest}</span> : null}
        </label>
      </fieldset>

      <button type="submit" className={styles.primaryAction} disabled={state.phase === "submitting"}>
        {state.phase === "submitting" ? "Enviando…" : "Registrar solicitud"}
      </button>
    </form>
  );
}
