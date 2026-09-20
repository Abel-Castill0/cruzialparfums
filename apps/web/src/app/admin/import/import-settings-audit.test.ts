import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("import settings validation (settings-schema)", () => {
  it("accepts confirmed import contact values via the shared schema", () => {
    const content = read("domains/admin-parfums/settings-schema.ts");
    expect(content).toContain("whatsappNumber");
    expect(content).toContain("whatsappDisplay");
    expect(content).toContain("contactEmail");
  });

  it("E.164 pattern rejects + prefix", () => {
    const content = read("domains/admin-parfums/settings-schema.ts");
    expect(content).toContain("/^[1-9][0-9]{7,14}$/");
  });
});

describe("import settings action uses 'import' unit", () => {
  it("action calls requireUnitAdmin with 'import'", () => {
    const actions = read("app/admin/import/configuracion/actions.ts");
    expect(actions).toContain('requireUnitAdmin("import")');
  });

  it("action revalidates import paths", () => {
    const actions = read("app/admin/import/configuracion/actions.ts");
    expect(actions).toContain('revalidatePath("/admin/import/configuracion")');
    expect(actions).toContain('revalidatePath("/admin/import")');
  });

  it("action handles all error types", () => {
    const actions = read("app/admin/import/configuracion/actions.ts");
    expect(actions).toContain('"unauthorized"');
    expect(actions).toContain('"forbidden"');
    expect(actions).toContain('"not_found"');
    expect(actions).toContain('"conflict"');
    expect(actions).toContain('"unknown"');
  });
});

describe("IMPORT_SETTINGS is no longer a runtime dependency for import storefront", () => {
  it("import/page.tsx does not import IMPORT_SETTINGS", () => {
    const content = read("app/import/page.tsx");
    expect(content).not.toContain("IMPORT_SETTINGS");
  });

  it("import/producto/[slug]/page.tsx does not import IMPORT_SETTINGS", () => {
    const content = read("app/import/producto/[slug]/page.tsx");
    expect(content).not.toContain("IMPORT_SETTINGS");
  });

  it("import-header.tsx does not import IMPORT_SETTINGS", () => {
    const content = read("components/import/shell/import-header.tsx");
    expect(content).not.toContain("IMPORT_SETTINGS");
  });

  it("import-footer.tsx does not import IMPORT_SETTINGS", () => {
    const content = read("components/import/shell/import-footer.tsx");
    expect(content).not.toContain("IMPORT_SETTINGS");
  });

  it("import-information.tsx does not import IMPORT_SETTINGS", () => {
    const content = read("components/import/storefront/import-information.tsx");
    expect(content).not.toContain("IMPORT_SETTINGS");
  });
});

describe("fail-closed public contact", () => {
  it("readImportPublicContact validates whatsappNumber with E.164 pattern", () => {
    const content = read("domains/import/import-public-contact.ts");
    expect(content).toContain("/^[1-9][0-9]{7,14}$/");
  });

  it("readImportPublicContact validates contactEmail with email pattern", () => {
    const content = read("domains/import/import-public-contact.ts");
    expect(content).toContain("/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/");
  });

  it("readImportPublicContact returns null on error", () => {
    const content = read("domains/import/import-public-contact.ts");
    expect(content).toContain("if (error) return null");
    expect(content).toContain("return data ? mapContact(data.value) : null");
  });
});

describe("import configuracion page module", () => {
  it("exports configuracion.module.css", () => {
    const cssPath = path.join(ROOT, "app/admin/import/configuracion/configuracion.module.css");
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  it("page uses businessUnitCode 'import'", () => {
    const content = read("app/admin/import/configuracion/page.tsx");
    expect(content).toContain('businessUnitCode === "import"');
  });

  it("viewer mode shows read-only notice", () => {
    const content = read("app/admin/import/configuracion/page.tsx");
    expect(content).toContain("solo lectura para Import");
  });
});

describe("import audit page structure", () => {
  it("audit list page uses businessUnitCode 'import'", () => {
    const content = read("app/admin/import/auditoria/page.tsx");
    expect(content).toContain('"import"');
  });

  it("audit detail page uses businessUnitCode 'import'", () => {
    const content = read("app/admin/import/auditoria/[id]/page.tsx");
    expect(content).toContain('"import"');
  });

  it("audit detail validates UUID and calls notFound()", () => {
    const content = read("app/admin/import/auditoria/[id]/page.tsx");
    expect(content).toContain("isValidUuid");
    expect(content).toContain("notFound()");
  });
});
