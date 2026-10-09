import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportClosedNotice } from "./import-closed-notice";

describe("ImportClosedNotice", () => {
  it("says a closed consolidado is closed", () => {
    const html = renderToStaticMarkup(<ImportClosedNotice contact={null} unavailable={false} />);
    expect(html).toContain("Consolidado cerrado");
    expect(html).toContain("No hay un consolidado activo");
  });

  it("never claims there is no active consolidado when the read itself failed", () => {
    const html = renderToStaticMarkup(<ImportClosedNotice contact={null} unavailable />);
    expect(html).toContain("No pudimos consultar el catálogo.");
    expect(html).toContain("No pudimos consultar el estado del consolidado");
    expect(html).not.toContain("No hay un consolidado activo");
  });
});
