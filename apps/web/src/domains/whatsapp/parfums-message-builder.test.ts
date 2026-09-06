import { describe, expect, it } from "vitest";
import {
  buildProductConsultationMessage,
  buildCheckoutMessage,
  buildWhatsAppUrl,
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
});
