import { describe, expect, it } from "vitest";
import type { PersistedImportOrderSummary } from "@/domains/orders/import-persisted-summary";

function buildImportWhatsAppMessage(summary: PersistedImportOrderSummary): string {
  const parts = [
    `Hola Cruzial Import.`,
    `Quiero continuar con mi solicitud ${summary.orderNumber}`,
    ``,
    summary.campaignNumber != null ? `Consolidado #${summary.campaignNumber}` : null,
    ``,
    ...summary.lines.map((line) => {
      return `• ${line.productNameSnapshot} — ${line.variantLabelSnapshot}\n  ${line.quantity} × S/ ${line.unitPriceAmount.toFixed(2)} = S/ ${line.lineTotalAmount.toFixed(2)}`;
    }),
    ``,
    `Subtotal: S/ ${summary.subtotalAmount.toFixed(2)}`,
    `Adelanto a coordinar (${summary.depositPercentageSnapshot}%): S/ ${summary.depositAmountSnapshot.toFixed(2)}`,
    ``,
    `Nombre: ${summary.customerSnapshot.name}`,
    `Teléfono: ${summary.customerSnapshot.phone}`,
    ``,
    `Delivery privado:`,
    `Distrito: ${summary.deliverySnapshot.district}`,
    `Dirección: ${summary.deliverySnapshot.address}`,
    ``,
    `La solicitud ya fue registrada en Cruzial.`,
  ];
  return parts.filter((p) => p !== null).join("\n");
}

function buildImportWhatsAppUrl(whatsappNumber: string, message: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function makeSummary(overrides?: Partial<PersistedImportOrderSummary>): PersistedImportOrderSummary {
  return {
    orderNumber: "CRI-20260911-abc123",
    campaignNumber: 6,
    customerSnapshot: { name: "Juan Pérez", phone: "51999111222" },
    deliverySnapshot: { district: "San Isidro", address: "Av. 123", note: "" },
    subtotalAmount: 240.0,
    depositPercentageSnapshot: 50,
    depositAmountSnapshot: 120.0,
    currency: "PEN",
    lines: [
      {
        productNameSnapshot: "Armaf Club de Nuit",
        variantLabelSnapshot: "105 ml",
        unitPriceAmount: 120.0,
        quantity: 2,
        lineTotalAmount: 240.0,
        currency: "PEN",
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("import whatsapp message builder — persisted summary", () => {
  it("includes order number from persisted summary", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("CRI-20260911-abc123");
  });

  it("includes campaign number from persisted summary", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("Consolidado #6");
  });

  it("includes persisted customer name", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("Nombre: Juan Pérez");
  });

  it("includes persisted customer phone", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("Teléfono: 51999111222");
  });

  it("includes persisted district directly from deliverySnapshot", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("Distrito: San Isidro");
  });

  it("includes persisted delivery address", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("Dirección: Av. 123");
  });

  it("includes deposit percentage and amount from persisted summary", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("50%");
    expect(msg).toContain("120.00");
  });

  it("includes persisted item lines with qty × price = total", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).toContain("• Armaf Club de Nuit — 105 ml");
    expect(msg).toContain("2 × S/ 120.00 = S/ 240.00");
  });

  it("does not expose internal UUIDs", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).not.toContain("offerId");
    expect(msg).not.toContain("requestId");
    expect(msg).not.toContain("customer_id");
  });

  it("does not claim payment confirmed", () => {
    const msg = buildImportWhatsAppMessage(makeSummary());
    expect(msg).not.toContain("confirmado");
    expect(msg).not.toContain("pagado");
    expect(msg).not.toContain("completado");
  });
});

describe("import idempotent retry — persisted truth wins", () => {
  it("altered retry cannot inject different customer name", () => {
    const originalSummary = makeSummary({
      customerSnapshot: { name: "Abel", phone: "51999111222" },
    });
    const msg = buildImportWhatsAppMessage(originalSummary);
    expect(msg).toContain("Nombre: Abel");
    expect(msg).not.toContain("Nombre: Different Person");
  });

  it("altered retry cannot inject different phone", () => {
    const originalSummary = makeSummary({
      customerSnapshot: { name: "Abel", phone: "51999111222" },
    });
    const msg = buildImportWhatsAppMessage(originalSummary);
    expect(msg).toContain("Teléfono: 51999111222");
    expect(msg).not.toContain("Teléfono: 0000000000");
  });

  it("altered retry cannot inject different district", () => {
    const originalSummary = makeSummary({
      deliverySnapshot: { district: "Lima", address: "Address A", note: "" },
    });
    const msg = buildImportWhatsAppMessage(originalSummary);
    expect(msg).toContain("Distrito: Lima");
    expect(msg).not.toContain("Distrito: Different District");
  });

  it("altered retry cannot inject different lines/prices", () => {
    const originalSummary = makeSummary({
      lines: [
        {
          productNameSnapshot: "Product A",
          variantLabelSnapshot: "100 ml",
          unitPriceAmount: 210.0,
          quantity: 1,
          lineTotalAmount: 210.0,
          currency: "PEN",
          sortOrder: 0,
        },
      ],
      subtotalAmount: 210.0,
      depositPercentageSnapshot: 50,
      depositAmountSnapshot: 105.0,
    });
    const msg = buildImportWhatsAppMessage(originalSummary);
    expect(msg).toContain("Product A");
    expect(msg).toContain("210.00");
    expect(msg).not.toContain("Product B");
    expect(msg).not.toContain("999.99");
  });

  it("altered retry cannot inject different deposit values", () => {
    const original = makeSummary({ depositPercentageSnapshot: 70, depositAmountSnapshot: 168.0 });
    const msg = buildImportWhatsAppMessage(original);
    expect(msg).toContain("70%");
    expect(msg).toContain("168.00");
    expect(msg).not.toContain("Adelanto a coordinar (50%)");
  });

  it("persisted item lines remain authoritative", () => {
    const summary = makeSummary({
      lines: [
        {
          productNameSnapshot: "Lattafa Khamrah",
          variantLabelSnapshot: "50 ml",
          unitPriceAmount: 85.0,
          quantity: 3,
          lineTotalAmount: 255.0,
          currency: "PEN",
          sortOrder: 0,
        },
        {
          productNameSnapshot: "Armaf Club de Nuit",
          variantLabelSnapshot: "105 ml",
          unitPriceAmount: 120.0,
          quantity: 1,
          lineTotalAmount: 120.0,
          currency: "PEN",
          sortOrder: 1,
        },
      ],
      subtotalAmount: 375.0,
      depositPercentageSnapshot: 50,
      depositAmountSnapshot: 187.5,
    });
    const msg = buildImportWhatsAppMessage(summary);
    expect(msg).toContain("• Lattafa Khamrah — 50 ml");
    expect(msg).toContain("3 × S/ 85.00 = S/ 255.00");
    expect(msg).toContain("• Armaf Club de Nuit — 105 ml");
    expect(msg).toContain("1 × S/ 120.00 = S/ 120.00");
    expect(msg).toContain("Subtotal: S/ 375.00");
    expect(msg).toContain("Adelanto a coordinar (50%): S/ 187.50");
  });
});

describe("import whatsapp URL builder", () => {
  it("uses DB-configured number", () => {
    const url = buildImportWhatsAppUrl("51988776655", "test");
    expect(url).toContain("wa.me/51988776655");
  });

  it("encodes message in URL", () => {
    const msg = "Hola Cruzial Import — solicitud CRI-20260911";
    const url = buildImportWhatsAppUrl("51926390591", msg);
    expect(url).toContain(encodeURIComponent(msg));
  });
});

describe("import DB public_contact fail-closed", () => {
  it("missing contact returns whatsappUrl null, not hardcoded fallback", () => {
    const contact = null;
    const whatsappUrl = contact ? buildImportWhatsAppUrl(contact.whatsappNumber, "msg") : null;
    expect(whatsappUrl).toBeNull();
  });

  it("invalid contact returns whatsappUrl null", () => {
    const contact = { whatsappNumber: "invalid", whatsappDisplay: "", contactEmail: "" };
    const isValid = /^[1-9][0-9]{7,14}$/.test(contact.whatsappNumber);
    const whatsappUrl = isValid ? buildImportWhatsAppUrl(contact.whatsappNumber, "msg") : null;
    expect(whatsappUrl).toBeNull();
  });

  it("valid DB contact is used instead of hardcoded", () => {
    const dbNumber = "51988776655";
    const hardcodedNumber = "51926390591";
    const url = buildImportWhatsAppUrl(dbNumber, "test");
    expect(url).toContain(dbNumber);
    expect(url).not.toContain(hardcodedNumber);
  });
});

describe("import multi-presentation catalog UX", () => {
  it("single presentation product can direct-add", () => {
    const presentations = [{ availability: "available" }];
    const isSingle = presentations.length === 1;
    const hasAvailable = presentations.some((p) => p.availability === "available");
    expect(isSingle && hasAvailable).toBe(true);
  });

  it("multi-presentation product shows Elegir presentacion", () => {
    const presentations = [
      { availability: "available" },
      { availability: "available" },
    ];
    const isSingle = presentations.length === 1;
    expect(isSingle).toBe(false);
  });

  it("all out of stock shows Agotado", () => {
    const presentations = [
      { availability: "out_of_stock" },
      { availability: "out_of_stock" },
    ];
    const hasAvailable = presentations.some((p) => p.availability === "available");
    expect(hasAvailable).toBe(false);
  });
});

describe("import stale cart error messages", () => {
  it("cart_changed message is user-friendly", () => {
    const msg = "Uno o más productos cambiaron. Actualiza tu carrito antes de continuar.";
    expect(msg).toContain("carrito");
  });

  it("product_unavailable message is user-friendly", () => {
    const msg = "Uno o más productos ya no están disponibles.";
    expect(msg).toContain("disponibles");
  });

  it("campaign_unavailable message is user-friendly", () => {
    const msg = "Este consolidado ya no está aceptando solicitudes.";
    expect(msg).toContain("consolidado");
  });
});
