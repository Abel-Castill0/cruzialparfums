import { describe, expect, it } from "vitest";
import {
  buildProductConsultationMessage,
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
});
