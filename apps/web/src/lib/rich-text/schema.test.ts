import { describe, expect, it } from "vitest";
import {
  RICH_TEXT_BODY_MAX,
  RICH_TEXT_TITLE_MAX,
  findRichTextProblems,
  httpsUrlSchema,
  restrictedMarkdownSchema,
  validateRichTextFields,
} from "./schema";

describe("findRichTextProblems", () => {
  it("lets the allowed Markdown through", () => {
    const ok = "Texto con **negrita**, *cursiva* y un [enlace](https://cruzial.pe).\n\n- uno\n- dos\n\nSalto\nde línea.";
    expect(findRichTextProblems(ok)).toEqual([]);
  });

  it.each([
    ["<script>alert(1)</script>", "html"],
    ["<SCRIPT SRC=https://evil.com/x.js></SCRIPT>", "html"],
    ["<img src=x onerror=alert(1)>", "html"],
    ["<iframe src=\"https://evil.com\"></iframe>", "html"],
    ["<style>body{display:none}</style>", "html"],
    ["<svg onload=alert(1)>", "html"],
    ["<!-- comentario -->", "html"],
    ["<a href=\"https://x.com\">x</a>", "html"],
    ["<https://evil.com>", "html"],
    ["![x](https://cruzial.pe/a.png)", "image"],
    ["[clic](javascript:alert(1))", "link"],
    ["[clic](JAVASCRIPT:alert(1))", "link"],
    ["[clic](data:text/html;base64,PHNjcmlwdD4=)", "link"],
    ["[clic](http://cruzial.pe)", "link"],
    ["[clic](//evil.com)", "link"],
    ["[clic](/admin)", "link"],
    ["[clic](https://user:pass@evil.com)", "link"],
    ["[clic]()", "link"],
    ["hola\u0000mundo", "control"],
  ])("refuses %j (%s)", (source, problem) => {
    expect(findRichTextProblems(source)).toContain(problem);
  });

  it("a handler name or a quote in plain text is harmless and allowed (it can only be rendered as text)", () => {
    expect(findRichTextProblems("onerror=alert(1) y onclick=\"x\"")).toEqual([]);
    expect(findRichTextProblems("Precio < S/ 30 y > S/ 10")).toEqual([]);
  });
});

describe("restrictedMarkdownSchema", () => {
  it("accepts up to 2000 characters and refuses 2001", () => {
    expect(restrictedMarkdownSchema.safeParse("a".repeat(RICH_TEXT_BODY_MAX)).success).toBe(true);
    const tooLong = restrictedMarkdownSchema.safeParse("a".repeat(RICH_TEXT_BODY_MAX + 1));
    expect(tooLong.success).toBe(false);
  });

  it("says why in Spanish", () => {
    const result = restrictedMarkdownSchema.safeParse("<script>x</script>");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/No se permite HTML/);
  });
});

describe("httpsUrlSchema", () => {
  it("only https", () => {
    expect(httpsUrlSchema.safeParse("https://cruzial.pe").success).toBe(true);
    for (const bad of ["http://cruzial.pe", "javascript:alert(1)", "data:text/html,x", "//x.com", "ftp://x.com", "cruzial.pe", ""]) {
      expect(httpsUrlSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("validateRichTextFields", () => {
  it("title max 80, body max 2000", () => {
    expect(validateRichTextFields({ title: "a".repeat(RICH_TEXT_TITLE_MAX), body: "ok" }).ok).toBe(true);
    const result = validateRichTextFields({ title: "a".repeat(RICH_TEXT_TITLE_MAX + 1), body: "ok" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.title).toMatch(/80/);
  });

  it("trims the title and requires one", () => {
    const ok = validateRichTextFields({ title: "  Condiciones  ", body: "" });
    expect(ok.ok && ok.value.title).toBe("Condiciones");
    const empty = validateRichTextFields({ title: "   ", body: "x" });
    expect(!empty.ok && empty.errors.title).toMatch(/título/);
  });

  it("reports the first message per field in the admin's shape", () => {
    const result = validateRichTextFields({ title: "Hola", body: "<img src=x onerror=alert(1)> [x](javascript:alert(1))" });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors)).toEqual(["body"]);
  });

  it("refuses non-string input without throwing", () => {
    expect(validateRichTextFields({ title: 1, body: null }).ok).toBe(false);
    expect(validateRichTextFields(null).ok).toBe(false);
    expect(validateRichTextFields(undefined).ok).toBe(false);
  });
});
