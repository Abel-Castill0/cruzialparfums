import { describe, expect, it } from "vitest";
import { emptyComplaintsMessage } from "./complaint-presentation";

describe("emptyComplaintsMessage", () => {
  it("never claims everything is attended for an overdue-only view with zero rows", () => {
    const message = emptyComplaintsMessage({ status: "", search: "", urgency: "overdue" });
    expect(message.title).toBe("No tienes reclamos con el plazo vencido.");
    expect(message.title).not.toContain("Todo está atendido");
    expect(message.detail).not.toBeNull();
  });

  it("combines the overdue filter with an active search truthfully", () => {
    const message = emptyComplaintsMessage({ status: "", search: "maria", urgency: "overdue" });
    expect(message.title).toBe("No hay reclamos con el plazo vencido que coincidan con esta búsqueda.");
  });

  it("prioritizes the overdue message over a status filter (urgency is the narrower claim)", () => {
    const message = emptyComplaintsMessage({ status: "received", search: "", urgency: "overdue" });
    expect(message.title).toBe("No tienes reclamos con el plazo vencido.");
  });

  it("reserves 'Todo está atendido' for the true zero-complaints case (no filters at all)", () => {
    const message = emptyComplaintsMessage({ status: "", search: "", urgency: "" });
    expect(message.title).toBe("No tienes reclamos pendientes.");
    expect(message.detail).toBe("Todo está atendido.");
  });

  it("uses the search message when only a search term is active", () => {
    const message = emptyComplaintsMessage({ status: "", search: "maria", urgency: "" });
    expect(message.title).toBe("No hay reclamos que coincidan con esta búsqueda.");
  });

  it("uses the per-status message when only a status tab is active", () => {
    expect(emptyComplaintsMessage({ status: "received", search: "", urgency: "" }).title).toBe("No tienes reclamos nuevos.");
    expect(emptyComplaintsMessage({ status: "in_review", search: "", urgency: "" }).title).toBe("No tienes reclamos en atención.");
    expect(emptyComplaintsMessage({ status: "resolved", search: "", urgency: "" }).title).toBe("Todavía no hay reclamos resueltos.");
  });
});
