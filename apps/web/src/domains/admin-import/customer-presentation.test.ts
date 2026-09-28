import { describe, expect, it } from "vitest";
import { customerListHref, customerStatusOptions, customerStatusPresentation, depositConsequence, policyKeyFor } from "./customer-presentation";

describe("deposit consequence", () => {
  const policies = { ok: true as const, new: 50, returning: 30 };

  it("mirrors the order RPC: pending and new use the new policy", () => {
    expect(policyKeyFor("pending_verification")).toBe("new");
    expect(policyKeyFor("new")).toBe("new");
    expect(policyKeyFor("returning")).toBe("returning");
    expect(policyKeyFor("vip")).toBeNull();
  });

  it("states the data-driven percentage and that snapshots are preserved", () => {
    const result = depositConsequence("returning", policies);
    expect(result.title).toBe("Depósito actual: 30%");
    expect(result.detail).toMatch(/conservan el porcentaje/);
    expect(depositConsequence("pending_verification", policies).detail).toMatch(/política de cliente nuevo/);
  });

  it("never substitutes a default when no policy is active", () => {
    const result = depositConsequence("returning", { ok: true, new: 50, returning: null });
    expect(result.title).toBe("No hay una política activa para este estado");
    expect(result.tone).toBe("danger");
  });

  it("reports an unreadable policy as unverified, not as missing", () => {
    expect(depositConsequence("new", { ok: false }).title).toBe("No pudimos verificar la política de depósito");
  });
});

describe("customer status UX", () => {
  it("flags pending verification", () => {
    expect(customerStatusPresentation("pending_verification").tone).toBe("attention");
  });

  it("describes each option's deposit effect from data", () => {
    const options = customerStatusOptions({ ok: true, new: 50, returning: null });
    expect(options.find((o) => o.value === "new")?.consequence).toBe("Nuevas solicitudes: 50% de depósito.");
    expect(options.find((o) => o.value === "returning")?.consequence).toBe("Nuevas solicitudes: sin política activa.");
  });

  it("keeps search and archive scope when switching tabs", () => {
    expect(customerListHref("/admin/import/clientes", { q: "ana", archived: "all" }, "new")).toBe("/admin/import/clientes?q=ana&status=new&archived=all");
    expect(customerListHref("/admin/import/clientes", { q: "", archived: "active" }, "")).toBe("/admin/import/clientes");
  });
});
