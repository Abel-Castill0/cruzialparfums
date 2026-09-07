import { describe, expect, it } from "vitest";
import {
  buildProductConsultationMessage,
  buildCheckoutMessage,
  buildContactMessage,
  buildCustomComboMessage,
  buildWhatsAppUrl,
  buildWholesaleInquiryMessage,
  buildWholesaleProductMessage,
} from "./parfums-message-builder";

describe("Parfums WhatsApp message builder", () => {
  it("builds and encodes a product consultation without inventing a number", () => {
    const message = buildProductConsultationMessage({
      storeName: "Cruzial Parfums",
      brand: "Lattafa",
      productName: "Khamrah Clásico",
    });
    const url = buildWhatsAppUrl("51924590921", message);
    expect(url).toBe(
      `https://wa.me/51924590921?text=${encodeURIComponent(message)}`,
    );
    expect(decodeURIComponent(new URL(url).searchParams.get("text") ?? "")).toBe(
      message,
    );
  });

  it("builds checkout copy that requests confirmation instead of claiming an order", () => {
    const message = buildCheckoutMessage({
      storeName: "Cruzial Parfums",
      lines: [{
        brand: "Lattafa",
        name: "Khamrah Clásico",
        variantLabel: "Decant 5 ml",
        quantity: 2,
        subtotal: 32,
      }],
      total: 32,
      customer: {
        name: "Ana Pérez",
        phone: "999 111 222",
        district: "Miraflores, Lima",
        delivery: "Lima Metropolitana — Motorizado",
      },
    });

    expect(message).toContain("TOTAL ESTIMADO: S/ 32.00");
    expect(message).toContain("Continúo en WhatsApp para confirmar stock");
    expect(message.toLocaleLowerCase("es")).not.toContain("pedido confirmado");
    expect(decodeURIComponent(buildWhatsAppUrl("51924590921", message))).toContain("Ana Pérez");
  });

  it("encodes a custom combo with an independent size per line", () => {
    const message = buildCustomComboMessage({
      storeName: "Cruzial Parfums",
      lines: [
        { brand: "Lattafa", name: "Khamrah Clásico", subtotal: 26, variantLabel: "10 ml" },
        { brand: "Lattafa", name: "Khamrah Qahwa", subtotal: 12, variantLabel: "3 ml" },
        { brand: "Lattafa", name: "Yara Candy", subtotal: 15, variantLabel: "5 ml" },
      ],
      total: 53,
    });
    expect(message).toContain("combo personalizado de 3 fragancias, cada una con su propio tamaño");
    expect(message).toContain("Khamrah Clásico (10 ml) — S/ 26.00");
    expect(message).toContain("Khamrah Qahwa (3 ml) — S/ 12.00");
    expect(message).toContain("Yara Candy (5 ml) — S/ 15.00");
    expect(message).toContain("TOTAL ESTIMADO: S/ 53.00");
    expect(decodeURIComponent(buildWhatsAppUrl("51924590921", message))).toContain("Khamrah Clásico");
  });

  it("labels wholesale row pricing as referential legacy data", () => {
    const message = buildWholesaleProductMessage({
      storeName: "Cruzial Parfums",
      brand: "Lattafa",
      productName: "Khamrah Clásico",
      prices: { unit: 130, m4: 122, m12: 114 },
    });

    expect(message).toContain("Precios referenciales legacy");
    expect(message).toContain("S/ 122.00 (4+ uds)");
    expect(message).toContain("confirmar disponibilidad y tarifa exacta");
  });

  it("builds a wholesale inquiry without an unverified response-time promise", () => {
    const message = buildWholesaleInquiryMessage({
      storeName: "Cruzial Parfums",
      name: "Ana",
      phone: "999 111 222",
      volume: "20 – 50 unidades",
    });

    expect(message).toContain("Nombre: Ana");
    expect(message).not.toMatch(/respuesta en/i);
  });

  it("builds a contact message without claiming an order or a response time", () => {
    const message = buildContactMessage({
      storeName: "Cruzial Parfums",
      name: "Lucía",
      phone: "987 654 321",
      topic: "Recomendación de fragancia",
      message: "Busco algo amaderado para regalo.",
    });

    expect(message).toContain("Nombre: Lucía");
    expect(message).toContain("Motivo: Recomendación de fragancia");
    expect(message).not.toMatch(/respuesta en|en minutos/i);
    expect(message).not.toMatch(/pedido confirmado|confirmado/i);
  });
});
