import { describe, it, expect } from "vitest";
import {
  importOrderStatusLabel,
  allowedImportOrderTransitions,
  importCustomerStatusLabel,
} from "./import-status";

describe("importOrderStatusLabel", () => {
  it("maps pending_whatsapp_confirmation", () => {
    expect(importOrderStatusLabel("pending_whatsapp_confirmation")).toBe("Pendiente por WhatsApp");
  });
  it("maps confirmed", () => {
    expect(importOrderStatusLabel("confirmed")).toBe("Coordinación confirmada");
  });
  it("maps fulfilled", () => {
    expect(importOrderStatusLabel("fulfilled")).toBe("Completado");
  });
  it("maps cancelled", () => {
    expect(importOrderStatusLabel("cancelled")).toBe("Cancelado");
  });
  it("falls back for unrecognized", () => {
    expect(importOrderStatusLabel("unknown")).toBe("Estado no reconocido");
  });
});

describe("allowedImportOrderTransitions", () => {
  it("pending → confirmed, cancelled", () => {
    expect(allowedImportOrderTransitions("pending_whatsapp_confirmation")).toEqual(["confirmed", "cancelled"]);
  });
  it("confirmed → fulfilled, cancelled", () => {
    expect(allowedImportOrderTransitions("confirmed")).toEqual(["fulfilled", "cancelled"]);
  });
  it("fulfilled is terminal", () => {
    expect(allowedImportOrderTransitions("fulfilled")).toEqual([]);
  });
  it("cancelled is terminal", () => {
    expect(allowedImportOrderTransitions("cancelled")).toEqual([]);
  });
  it("unknown status → empty", () => {
    expect(allowedImportOrderTransitions("bogus")).toEqual([]);
  });
});

describe("importCustomerStatusLabel", () => {
  it("maps pending_verification", () => {
    expect(importCustomerStatusLabel("pending_verification")).toBe("Pendiente de verificación");
  });
  it("maps new", () => {
    expect(importCustomerStatusLabel("new")).toBe("Nuevo");
  });
  it("maps returning", () => {
    expect(importCustomerStatusLabel("returning")).toBe("Recurrente");
  });
  it("falls back for unrecognized", () => {
    expect(importCustomerStatusLabel("unknown")).toBe("Estado no reconocido");
  });
});
