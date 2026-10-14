import { describe, expect, it } from "vitest";
import { parseInline, parseRestrictedMarkdown, parseSafeHttpsUrl } from "./parse";

const text = (value: string) => ({ type: "text", value });

describe("parseSafeHttpsUrl", () => {
  it("accepts absolute https URLs and normalizes them", () => {
    expect(parseSafeHttpsUrl("https://cruzial.pe/parfums")).toBe("https://cruzial.pe/parfums");
    expect(parseSafeHttpsUrl("HTTPS://Cruzial.pe")).toBe("https://cruzial.pe/");
  });

  it.each([
    "http://cruzial.pe",
    "//evil.com",
    "/relative/path",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "https://user:pass@evil.com",
    "https://",
    "https://exa mple.com",
    "https://evil.com/\"onmouseover=\"x",
    "https://evil.com/<script>",
    "https://evil.com/\u0000",
    "ftp://evil.com",
    "",
  ])("refuses %j", (raw) => {
    expect(parseSafeHttpsUrl(raw)).toBeNull();
  });

  it("refuses an absurdly long URL", () => {
    expect(parseSafeHttpsUrl(`https://cruzial.pe/${"a".repeat(2100)}`)).toBeNull();
  });
});

describe("parseInline", () => {
  it("plain text stays plain text", () => {
    expect(parseInline("Hola mundo")).toEqual([text("Hola mundo")]);
  });

  it("bold, italic and links", () => {
    expect(parseInline("a **b** c")).toEqual([text("a "), { type: "strong", children: [text("b")] }, text(" c")]);
    expect(parseInline("a *b* c")).toEqual([text("a "), { type: "em", children: [text("b")] }, text(" c")]);
    expect(parseInline("[Cruzial](https://cruzial.pe)")).toEqual([
      { type: "link", href: "https://cruzial.pe/", children: [text("Cruzial")] },
    ]);
  });

  it("nests emphasis and links", () => {
    expect(parseInline("**negrita *y cursiva***")).toEqual([
      { type: "strong", children: [text("negrita "), { type: "em", children: [text("y cursiva")] }] },
    ]);
    expect(parseInline("**[enlace](https://cruzial.pe)**")).toEqual([
      { type: "strong", children: [{ type: "link", href: "https://cruzial.pe/", children: [text("enlace")] }] },
    ]);
  });

  it("an unclosed marker is literal text", () => {
    expect(parseInline("**sin cerrar")).toEqual([text("**sin cerrar")]);
    expect(parseInline("2 * 3 = 6")).toEqual([text("2 * 3 = 6")]);
    expect(parseInline("[sin cerrar](https://cruzial.pe")).toEqual([text("[sin cerrar](https://cruzial.pe")]);
  });

  it("a backslash escapes a marker", () => {
    expect(parseInline("\\*no cursiva\\*")).toEqual([text("*no cursiva*")]);
    expect(parseInline("\\[no enlace\\](https://cruzial.pe)")).toEqual([text("[no enlace](https://cruzial.pe)")]);
  });

  it("a link with a refused target is just text, never a link", () => {
    for (const bad of ["javascript:alert(1)", "http://x.com", "data:text/html,x", "//evil.com", "https://u:p@evil.com"]) {
      const nodes = parseInline(`[clic](${bad})`);
      expect(JSON.stringify(nodes)).not.toContain('"type":"link"');
    }
  });

  it("HTML in the text is plain text (the renderer escapes it): the parser never builds elements from it", () => {
    for (const html of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<iframe src=\"https://evil.com\"></iframe>", "<style>*{display:none}</style>"]) {
      const nodes = parseInline(html);
      expect(nodes.every((node) => node.type === "text" || node.type === "em" || node.type === "strong")).toBe(true);
      expect(JSON.stringify(nodes)).not.toContain('"type":"link"');
    }
  });

  it("does not blow up on adversarial input (no catastrophic backtracking)", () => {
    const started = performance.now();
    parseInline("*".repeat(2000));
    parseInline("*a ".repeat(700));
    parseInline("[".repeat(1000) + "](https://x.com)".repeat(50));
    parseInline("**".repeat(1000));
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("parseRestrictedMarkdown", () => {
  it("splits paragraphs on blank lines and keeps single newlines as line breaks", () => {
    expect(parseRestrictedMarkdown("uno\ndos\n\ntres")).toEqual([
      { type: "paragraph", children: [text("uno"), { type: "break" }, text("dos")] },
      { type: "paragraph", children: [text("tres")] },
    ]);
  });

  it("reads lists with - or *, and a paragraph before the list ends where the list starts", () => {
    expect(parseRestrictedMarkdown("Incluye:\n- uno\n- **dos**\n* tres")).toEqual([
      { type: "paragraph", children: [text("Incluye:")] },
      { type: "list", items: [[text("uno")], [{ type: "strong", children: [text("dos")] }], [text("tres")]] },
    ]);
  });

  it("handles CRLF and surrounding blank lines", () => {
    expect(parseRestrictedMarkdown("\r\n\r\nhola\r\n\r\n")).toEqual([{ type: "paragraph", children: [text("hola")] }]);
  });

  it("empty or blank text has no blocks", () => {
    expect(parseRestrictedMarkdown("")).toEqual([]);
    expect(parseRestrictedMarkdown("  \n \n")).toEqual([]);
  });

  it("headings, quotes and code are not Markdown here: they stay literal text", () => {
    expect(parseRestrictedMarkdown("# Título")).toEqual([{ type: "paragraph", children: [text("# Título")] }]);
    expect(parseRestrictedMarkdown("> cita")).toEqual([{ type: "paragraph", children: [text("> cita")] }]);
    expect(parseRestrictedMarkdown("`código`")).toEqual([{ type: "paragraph", children: [text("`código`")] }]);
  });
});
