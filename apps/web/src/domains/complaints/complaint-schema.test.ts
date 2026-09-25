import { describe, expect, it } from "vitest";
import {
  COMPLAINT_DETAIL_MAX_LENGTH,
  COMPLAINT_REQUEST_MAX_LENGTH,
  validateComplaintForm,
} from "./complaint-schema";

const valid = {
  complaintType: "reclamo",
  fullName: "Ana Pérez",
  documentType: "dni",
  documentNumber: "12345678",
  address: "Av. Lima 123",
  phone: "987654321",
  email: "ana@example.test",
  isMinor: false,
  guardianFullName: "",
  guardianDocumentNumber: "",
  orderReference: "",
  detail: "Detalle válido de la solicitud",
  consumerRequest: "Solicito una respuesta",
};

describe("complaint text boundaries", () => {
  it("accepts the complete 4000-character detail", () => {
    const detail = "D".repeat(COMPLAINT_DETAIL_MAX_LENGTH);
    const result = validateComplaintForm({ ...valid, detail });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.detail).toBe(detail);
  });

  it("rejects a 4001-character detail with a field error", () => {
    const result = validateComplaintForm({ ...valid, detail: "D".repeat(COMPLAINT_DETAIL_MAX_LENGTH + 1) });
    expect(result).toMatchObject({ ok: false, errors: { detail: expect.any(String) } });
  });

  it("accepts the complete 2000-character requested remedy", () => {
    const consumerRequest = "R".repeat(COMPLAINT_REQUEST_MAX_LENGTH);
    const result = validateComplaintForm({ ...valid, consumerRequest });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.consumerRequest).toBe(consumerRequest);
  });

  it("rejects a 2001-character requested remedy with a field error", () => {
    const result = validateComplaintForm({ ...valid, consumerRequest: "R".repeat(COMPLAINT_REQUEST_MAX_LENGTH + 1) });
    expect(result).toMatchObject({ ok: false, errors: { consumerRequest: expect.any(String) } });
  });

  it("does not silently shorten other submitted complaint fields", () => {
    const result = validateComplaintForm({ ...valid, orderReference: "R".repeat(61) });
    expect(result).toMatchObject({ ok: false, errors: { orderReference: expect.any(String) } });
  });
});
