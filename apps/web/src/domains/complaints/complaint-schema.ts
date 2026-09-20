import type { FieldErrors, ValidationResult } from "@/domains/admin-parfums/product-schema";

export type ComplaintType = "reclamo" | "queja";
export type ComplaintDocumentType = "dni" | "ce" | "pasaporte";
export type ComplaintStatus = "received" | "in_review" | "resolved";

export const COMPLAINT_TYPE_LABELS: Record<ComplaintType, string> = {
  reclamo: "Reclamo (disconformidad con el producto o servicio)",
  queja: "Queja (disconformidad con la atención)",
};

export const COMPLAINT_DOCUMENT_LABELS: Record<ComplaintDocumentType, string> = {
  dni: "DNI",
  ce: "Carné de extranjería",
  pasaporte: "Pasaporte",
};

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  received: "Recibido",
  in_review: "En revisión",
  resolved: "Resuelto",
};

export function isComplaintStatus(value: unknown): value is ComplaintStatus {
  return value === "received" || value === "in_review" || value === "resolved";
}

export type ComplaintFormInput = {
  complaintType: ComplaintType;
  fullName: string;
  documentType: ComplaintDocumentType;
  documentNumber: string;
  address: string;
  phone: string;
  email: string;
  isMinor: boolean;
  guardianFullName: string;
  guardianDocumentNumber: string;
  orderReference: string;
  detail: string;
  consumerRequest: string;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Mirrors public_submit_complaint_entry's own validation server-side —
 * this is the client/server-action-facing copy, not the authority. The RPC
 * re-validates everything independently. */
export function validateComplaintForm(input: Record<string, unknown>): ValidationResult<ComplaintFormInput> {
  const errors: FieldErrors = {};
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const complaintType = str(input.complaintType);
  if (complaintType !== "reclamo" && complaintType !== "queja") {
    errors.complaintType = "Selecciona el tipo de solicitud.";
  }

  const fullName = str(input.fullName);
  if (fullName.length < 2) errors.fullName = "Ingresa tu nombre completo.";

  const documentType = str(input.documentType);
  if (documentType !== "dni" && documentType !== "ce" && documentType !== "pasaporte") {
    errors.documentType = "Selecciona un tipo de documento.";
  }

  const documentNumber = str(input.documentNumber);
  if (documentNumber.length < 4) errors.documentNumber = "Ingresa tu número de documento.";

  const address = str(input.address);
  if (address.length < 4) errors.address = "Ingresa tu dirección.";

  const phoneDigits = str(input.phone).replace(/\D/g, "");
  if (!/^[0-9]{9,15}$/.test(phoneDigits)) errors.phone = "Ingresa un teléfono válido (9-15 dígitos).";

  const email = str(input.email);
  if (!EMAIL_PATTERN.test(email)) errors.email = "Ingresa un correo válido.";

  const isMinor = input.isMinor === true || input.isMinor === "true" || input.isMinor === "on";
  const guardianFullName = str(input.guardianFullName);
  const guardianDocumentNumber = str(input.guardianDocumentNumber);
  if (isMinor) {
    if (guardianFullName.length < 2) errors.guardianFullName = "Ingresa el nombre del apoderado.";
    if (guardianDocumentNumber.length < 4) errors.guardianDocumentNumber = "Ingresa el documento del apoderado.";
  }

  const orderReference = str(input.orderReference).slice(0, 60);

  const detail = str(input.detail);
  if (detail.length < 10) errors.detail = "Describe tu reclamo o queja con más detalle (mínimo 10 caracteres).";

  const consumerRequest = str(input.consumerRequest);
  if (consumerRequest.length < 5) errors.consumerRequest = "Indica qué solución esperas.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      complaintType: complaintType as ComplaintType,
      fullName,
      documentType: documentType as ComplaintDocumentType,
      documentNumber,
      address,
      phone: phoneDigits,
      email,
      isMinor,
      guardianFullName,
      guardianDocumentNumber,
      orderReference,
      detail,
      consumerRequest,
    },
  };
}
