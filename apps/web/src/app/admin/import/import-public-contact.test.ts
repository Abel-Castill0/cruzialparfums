import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "src");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("import layout provides contact context", () => {
  it("layout fetches readImportPublicContact and wraps with ImportContactProvider", () => {
    const layout = read("app/import/layout.tsx");
    expect(layout).toContain("readImportPublicContact");
    expect(layout).toContain("ImportContactProvider");
    expect(layout).toContain("contact={contact}");
  });

  it("layout does not import IMPORT_SETTINGS", () => {
    const layout = read("app/import/layout.tsx");
    expect(layout).not.toContain("IMPORT_SETTINGS");
  });
});

describe("import contact context module", () => {
  it("exports ImportContactProvider and useImportContact", async () => {
    const content = read("components/import/import-contact-context.tsx");
    expect(content).toContain("export function ImportContactProvider");
    expect(content).toContain("export function useImportContact");
  });

  it("provider creates a React context", () => {
    const content = read("components/import/import-contact-context.tsx");
    expect(content).toContain("createContext");
    expect(content).toContain("useContext");
  });
});

describe("import header uses contact context", () => {
  it("header imports useImportContact instead of IMPORT_SETTINGS", () => {
    const header = read("components/import/shell/import-header.tsx");
    expect(header).toContain("useImportContact");
    expect(header).not.toContain("IMPORT_SETTINGS");
  });

  it("header hides WhatsApp link when contact is null", () => {
    const header = read("components/import/shell/import-header.tsx");
    expect(header).toContain("whatsappNumber ? (");
  });

  it("header is a client component", () => {
    const header = read("components/import/shell/import-header.tsx");
    expect(header).toContain('"use client"');
  });
});

describe("import footer uses contact context", () => {
  it("footer imports useImportContact instead of IMPORT_SETTINGS", () => {
    const footer = read("components/import/shell/import-footer.tsx");
    expect(footer).toContain("useImportContact");
    expect(footer).not.toContain("IMPORT_SETTINGS");
  });

  it("footer hides WhatsApp and email links when contact is null", () => {
    const footer = read("components/import/shell/import-footer.tsx");
    expect(footer).toContain("whatsappNumber ? (");
    expect(footer).toContain("contactEmail ? (");
  });

  it("footer is a client component", () => {
    const footer = read("components/import/shell/import-footer.tsx");
    expect(footer).toContain('"use client"');
  });
});

describe("import information accepts contact prop", () => {
  it("ImportInformation accepts contact prop", () => {
    const info = read("components/import/storefront/import-information.tsx");
    expect(info).toContain("contact:");
    expect(info).not.toContain("IMPORT_SETTINGS");
  });

  it("ImportInformation hides WhatsApp CTA when contact is null", () => {
    const info = read("components/import/storefront/import-information.tsx");
    expect(info).toContain("waUrl ? (");
    expect(info).toContain("El canal de contacto no está disponible temporalmente.");
  });
});

describe("import main page reads DB contact", () => {
  it("import/page.tsx reads from readImportPublicContact", () => {
    const page = read("app/import/page.tsx");
    expect(page).toContain("readImportPublicContact");
    expect(page).not.toContain("IMPORT_SETTINGS");
  });

  it("ClosedState accepts contact prop", () => {
    const page = read("app/import/page.tsx");
    expect(page).toContain("contact: { whatsappNumber: string } | null");
  });

  it("ClosedState shows fallback message when contact is null", () => {
    const page = read("app/import/page.tsx");
    expect(page).toContain("El canal de contacto no está disponible temporalmente.");
  });

  it("page uses Promise.all for parallel fetch", () => {
    const page = read("app/import/page.tsx");
    expect(page).toContain("Promise.all");
  });
});

describe("import product page reads DB contact", () => {
  it("producto/[slug]/page.tsx reads from readImportPublicContact", () => {
    const page = read("app/import/producto/[slug]/page.tsx");
    expect(page).toContain("readImportPublicContact");
    expect(page).not.toContain("IMPORT_SETTINGS");
  });

  it("product page hides WhatsApp CTA when contact is null", () => {
    const page = read("app/import/producto/[slug]/page.tsx");
    expect(page).toContain("El canal de contacto no está disponible temporalmente.");
  });

  it("product page fetches contact in parallel with product", () => {
    const page = read("app/import/producto/[slug]/page.tsx");
    expect(page).toContain("Promise.all");
  });
});

describe("import checkout uses DB contact", () => {
  it("checkout actions use readImportPublicContact", () => {
    const actions = read("app/import/checkout/actions.ts");
    expect(actions).toContain("readImportPublicContact");
    expect(actions).not.toContain("IMPORT_SETTINGS");
  });

  it("checkout returns whatsappUrl: null when contact is missing", () => {
    const actions = read("app/import/checkout/actions.ts");
    expect(actions).toContain("whatsappUrl: null");
  });
});

describe("admin import dashboard navigation", () => {
  it("dashboard includes Configuración link", () => {
    const page = read("app/admin/import/page.tsx");
    expect(page).toContain("/admin/import/configuracion");
    expect(page).toContain("Configuración");
  });

  it("dashboard includes Auditoría link", () => {
    const page = read("app/admin/import/page.tsx");
    expect(page).toContain("/admin/import/auditoria");
    expect(page).toContain("Auditoría");
  });

  it("dashboard shows contact configured status", () => {
    const page = read("app/admin/import/page.tsx");
    expect(page).toContain("Contacto público");
    expect(page).toContain("Configurado");
    expect(page).toContain("Falta configurar");
  });

  it("dashboard reads settings via AdminParfumsSettingsRepository", () => {
    const page = read("app/admin/import/page.tsx");
    expect(page).toContain("AdminParfumsSettingsRepository");
    expect(page).toContain('"import"');
  });
});
