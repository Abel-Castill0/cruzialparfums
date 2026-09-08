import { describe, expect, it } from "vitest";
import { orderStatusLabel } from "./order-status";

describe("orderStatusLabel", () => {
  it("maps the only confirmed operational status to its UX copy", () => {
    expect(orderStatusLabel("pending_whatsapp_confirmation")).toBe("Pendiente por WhatsApp");
  });

  it("never leaks the raw DB enum for an unrecognized status", () => {
    expect(orderStatusLabel("paid")).toBe("Estado no reconocido");
    expect(orderStatusLabel("")).toBe("Estado no reconocido");
    expect(orderStatusLabel("draft")).toBe("Estado no reconocido");
  });
});
