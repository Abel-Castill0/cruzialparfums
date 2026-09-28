import { describe, expect, it } from "vitest";
import {
  ORDER_FILTER_TABS,
  buildOrderProgress,
  emptyOrdersMessage,
  formatRelativeLima,
  isOrderFilterStatus,
  orderActionCopy,
  orderListHref,
  orderNextStep,
  orderStatusPresentation,
} from "./order-presentation";

describe("orderStatusPresentation", () => {
  it("uses each unit's existing centralized label", () => {
    expect(orderStatusPresentation("parfums", "confirmed").label).toBe("Confirmada por WhatsApp");
    expect(orderStatusPresentation("import", "confirmed").label).toBe("Coordinación confirmada");
  });

  it("marks pending orders as needing attention", () => {
    const presentation = orderStatusPresentation("parfums", "pending_whatsapp_confirmation");
    expect(presentation.tone).toBe("attention");
    expect(presentation.situation).toBe("Esperando confirmación por WhatsApp");
  });

  it("never invents a situation for an unknown status", () => {
    const presentation = orderStatusPresentation("import", "shipped");
    expect(presentation.label).toBe("Estado no reconocido");
    expect(presentation.situation).toBeNull();
  });
});

describe("order filter tabs", () => {
  it("maps owner vocabulary onto existing stored statuses only", () => {
    expect(ORDER_FILTER_TABS.map((tab) => tab.status)).toEqual([
      "pending_whatsapp_confirmation",
      "confirmed",
      "fulfilled",
      "cancelled",
      "",
    ]);
    expect(ORDER_FILTER_TABS[0]!.label).toBe("Necesitan atención");
    expect(isOrderFilterStatus("pending_whatsapp_confirmation")).toBe(true);
    expect(isOrderFilterStatus("")).toBe(false);
    expect(isOrderFilterStatus("anything")).toBe(false);
  });

  it("keeps search and age, swaps status and drops the page", () => {
    expect(orderListHref("/admin/parfums/pedidos", { search: "ana", age: "old" }, "confirmed")).toBe(
      "/admin/parfums/pedidos?q=ana&status=confirmed&age=old",
    );
    expect(orderListHref("/admin/parfums/pedidos", { search: "", age: "" }, "")).toBe("/admin/parfums/pedidos");
  });

  it("distinguishes an empty filter from an empty inbox", () => {
    expect(emptyOrdersMessage("pending_whatsapp_confirmation", false).title).toBe(
      "No hay pedidos que necesiten atención.",
    );
    expect(emptyOrdersMessage("pending_whatsapp_confirmation", true).title).toMatch(/búsqueda/);
  });
});

describe("orderNextStep", () => {
  it("offers confirmation as primary and cancellation as secondary for pending orders", () => {
    const step = orderNextStep("parfums", "pending_whatsapp_confirmation");
    expect(step?.primaryTarget).toBe("confirmed");
    expect(step?.secondaryTargets).toEqual(["cancelled"]);
  });

  it("offers completion for confirmed orders", () => {
    const step = orderNextStep("import", "confirmed");
    expect(step?.primaryTarget).toBe("fulfilled");
    expect(step?.secondaryTargets).toEqual(["cancelled"]);
  });

  it("offers nothing for terminal statuses and nothing guessed for unknown ones", () => {
    expect(orderNextStep("parfums", "fulfilled")?.primaryTarget).toBeNull();
    expect(orderNextStep("parfums", "cancelled")?.secondaryTargets).toEqual([]);
    expect(orderNextStep("parfums", "weird")).toBeNull();
  });

  it("keeps the existing button names and marks cancellation as dangerous", () => {
    expect(orderActionCopy("parfums", "confirmed")?.label).toBe("Confirmar por WhatsApp");
    expect(orderActionCopy("import", "confirmed")?.label).toBe("Confirmar coordinación");
    expect(orderActionCopy("import", "cancelled")?.variant).toBe("danger");
    expect(orderActionCopy("import", "cancelled")?.consequence).toMatch(/definitiva/);
    expect(orderActionCopy("import", "archived")).toBeNull();
  });
});

describe("buildOrderProgress", () => {
  const createdAt = "2026-09-20T15:00:00.000Z";

  it("shows the confirmation as the current step for a pending order", () => {
    const steps = buildOrderProgress({ unit: "parfums", status: "pending_whatsapp_confirmation", createdAt, events: null });
    expect(steps?.map((step) => step.state)).toEqual(["done", "current", "upcoming"]);
  });

  it("marks every step done only for a fulfilled order", () => {
    const steps = buildOrderProgress({ unit: "import", status: "fulfilled", createdAt, events: [] });
    expect(steps?.every((step) => step.state === "done")).toBe(true);
  });

  it("does not claim a confirmation when the cancellation history is unavailable", () => {
    const steps = buildOrderProgress({ unit: "parfums", status: "cancelled", createdAt, events: null });
    expect(steps?.map((step) => step.key)).toEqual(["received", "cancelled"]);
    expect(steps?.[1]?.state).toBe("stopped");
  });

  it("shows the confirmation when the order was cancelled after confirming", () => {
    const steps = buildOrderProgress({
      unit: "parfums",
      status: "cancelled",
      createdAt,
      events: [
        { fromStatus: "pending_whatsapp_confirmation", toStatus: "confirmed", occurredAt: "2026-09-20T16:00:00.000Z" },
        { fromStatus: "confirmed", toStatus: "cancelled", occurredAt: "2026-09-21T16:00:00.000Z" },
      ],
    });
    expect(steps?.map((step) => `${step.key}:${step.state}`)).toEqual(["received:done", "confirm:done", "cancelled:stopped"]);
  });

  it("labels a cancellation before confirmation", () => {
    const steps = buildOrderProgress({
      unit: "import",
      status: "cancelled",
      createdAt,
      events: [{ fromStatus: "pending_whatsapp_confirmation", toStatus: "cancelled", occurredAt: "2026-09-21T16:00:00.000Z" }],
    });
    expect(steps?.map((step) => step.key)).toEqual(["received", "cancelled"]);
    expect(steps?.[1]?.detail).toMatch(/Antes de confirmarse/);
  });

  it("returns no progression for an unknown status", () => {
    expect(buildOrderProgress({ unit: "import", status: "weird", createdAt, events: null })).toBeNull();
  });
});

describe("formatRelativeLima", () => {
  const now = new Date("2026-09-28T17:00:00.000Z"); // 12:00 in Lima

  it("uses minutes and hours within the same Lima day", () => {
    expect(formatRelativeLima("2026-09-28T16:40:00.000Z", now)).toBe("Hace 20 min");
    expect(formatRelativeLima("2026-09-28T13:00:00.000Z", now)).toBe("Hace 4 h");
  });

  it("uses Lima calendar days, not UTC days", () => {
    // 2026-09-28T04:00Z is still 27 Sep 23:00 in Lima → "Ayer".
    expect(formatRelativeLima("2026-09-28T04:00:00.000Z", now)).toBe("Ayer");
    expect(formatRelativeLima("2026-09-25T17:00:00.000Z", now)).toBe("Hace 3 días");
  });

  it("falls back to an absolute date for older orders", () => {
    expect(formatRelativeLima("2026-08-01T17:00:00.000Z", now)).toMatch(/2026/);
  });
});
