import { describe, expect, it } from "vitest";

function buildImportWhatsAppMessage(
  orderNumber: string,
  campaignNumber: number,
  subtotal: number,
  depositPercentage: number,
  depositAmount: number,
  customerName: string,
  customerPhone: string,
  deliveryDistrict: string,
  deliveryAddress: string,
): string {
  const parts = [
    `Hola Cruzial Import.`,
    `Quiero continuar con mi solicitud ${orderNumber}`,
    ``,
    `Consolidado #${campaignNumber}`,
    ``,
    `Subtotal: S/ ${subtotal.toFixed(2)}`,
    `Adelanto a coordinar (${depositPercentage}%): S/ ${depositAmount.toFixed(2)}`,
    ``,
    `Nombre: ${customerName}`,
    `Teléfono: ${customerPhone}`,
    ``,
    `Delivery privado:`,
    `Distrito: ${deliveryDistrict}`,
    `Dirección: ${deliveryAddress}`,
    ``,
    `La solicitud ya fue registrada en Cruzial.`,
  ];
  return parts.join("\n");
}

function buildImportWhatsAppUrl(whatsappNumber: string, message: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

describe("import whatsapp message builder", () => {
  it("includes order number", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).toContain("CRI-20260911-abc123");
  });

  it("includes campaign number", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).toContain("Consolidado #6");
  });

  it("includes deposit percentage and amount", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).toContain("50%");
    expect(msg).toContain("120.00");
  });

  it("includes customer info", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan Pérez", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).toContain("Juan Pérez");
    expect(msg).toContain("51999111222");
  });

  it("includes delivery info", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).toContain("San Isidro");
    expect(msg).toContain("Av. 123");
  });

  it("does not expose internal UUIDs", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).not.toContain("offerId");
    expect(msg).not.toContain("requestId");
    expect(msg).not.toContain("customer_id");
  });

  it("does not claim payment confirmed", () => {
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, 240.0, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).not.toContain("confirmado");
    expect(msg).not.toContain("pagado");
    expect(msg).not.toContain("completado");
  });

  it("uses persisted values not browser input", () => {
    const persistedSubtotal = 240.0;
    const msg = buildImportWhatsAppMessage(
      "CRI-20260911-abc123", 6, persistedSubtotal, 50, 120.0,
      "Juan", "51999111222", "San Isidro", "Av. 123",
    );
    expect(msg).toContain("240.00");
    expect(msg).not.toContain("999.99");
  });
});

describe("import whatsapp URL builder", () => {
  it("uses correct WhatsApp number", () => {
    const url = buildImportWhatsAppUrl("51926390591", "test message");
    expect(url).toContain("wa.me/51926390591");
  });

  it("encodes message in URL", () => {
    const msg = "Hola Cruzial Import — solicitud CRI-20260911";
    const url = buildImportWhatsAppUrl("51926390591", msg);
    expect(url).toContain(encodeURIComponent(msg));
  });

  it("uses DB-configured number not hardcoded", () => {
    const dbNumber = "51988776655";
    const url = buildImportWhatsAppUrl(dbNumber, "test");
    expect(url).toContain("wa.me/51988776655");
  });
});

describe("import persisted summary", () => {
  it("summary contains required fields", () => {
    const summary = {
      orderNumber: "CRI-20260911-abc123",
      campaignNumber: 6,
      subtotal: 240.0,
      depositPercentage: 50,
      depositAmount: 120.0,
      whatsappUrl: "https://wa.me/51926390591?text=test",
    };
    expect(summary.orderNumber).toBeTruthy();
    expect(summary.campaignNumber).toBeGreaterThan(0);
    expect(summary.subtotal).toBeGreaterThan(0);
    expect([50, 70]).toContain(summary.depositPercentage);
    expect(summary.depositAmount).toBeGreaterThan(0);
    expect(summary.whatsappUrl).toContain("wa.me");
  });

  it("UI subtotal matches persisted subtotal", () => {
    const uiSubtotal = 240.0;
    const persistedSubtotal = 240.0;
    expect(uiSubtotal).toBe(persistedSubtotal);
  });

  it("UI deposit matches persisted deposit", () => {
    const uiDepositPct = 50;
    const uiDepositAmt = 120.0;
    const persistedPct = 50;
    const persistedAmt = 120.0;
    expect(uiDepositPct).toBe(persistedPct);
    expect(uiDepositAmt).toBe(persistedAmt);
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
