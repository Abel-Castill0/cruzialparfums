import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "./rich-text";

const html = (source: string, tone?: "light" | "dark") => renderToStaticMarkup(<RichText source={source} tone={tone} />);

describe("RichText", () => {
  it("renders paragraphs, line breaks, bold, italic, lists and links", () => {
    const out = html("Hola **mundo** y *tú*\notra línea\n\n- uno\n- dos\n\n[Cruzial](https://cruzial.pe)");
    expect(out).toContain("<p>Hola <strong>mundo</strong> y <em>tú</em><br/>otra línea</p>");
    expect(out).toContain("<ul><li>uno</li><li>dos</li></ul>");
    expect(out).toContain('<a href="https://cruzial.pe/" target="_blank" rel="noopener noreferrer">Cruzial</a>');
  });

  it("renders nothing for empty text", () => {
    expect(html("")).toBe("");
    expect(html("  \n\n ")).toBe("");
  });

  it("the dark tone only changes the class", () => {
    expect(html("x", "dark")).toMatch(/class="[^"]*dark[^"]*"/);
    expect(html("x")).not.toMatch(/dark/);
  });

  describe("malicious input never becomes markup", () => {
    const attacks = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<iframe src=\"https://evil.com\"></iframe>",
      "<style>body{display:none}</style>",
      "<svg onload=alert(1)>",
      "<a href=\"javascript:alert(1)\">x</a>",
      "<div onclick=\"alert(1)\">x</div>",
      "![x](https://cruzial.pe/a.png)",
      "[x](javascript:alert(1))",
      "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
      "[x](http://evil.com)",
      "[x](https://user:pass@evil.com)",
      "[a\" onclick=\"alert(1)](https://cruzial.pe)",
      "[x](https://cruzial.pe/\" onmouseover=\"alert(1))",
      "**<script>alert(1)</script>**",
      "- <img src=x onerror=alert(1)>",
      "&lt;script&gt;alert(1)&lt;/script&gt;",
      "<scr<script>ipt>alert(1)</scr</script>ipt>",
    ];

    it.each(attacks)("%j", (attack) => {
      const out = html(attack);
      // No tag the author did not get from the allowed set, and no executable attribute on any tag.
      expect(out).not.toMatch(/<(script|img|iframe|style|svg|object|embed|link|meta|form|input)\b/i);
      expect(out).not.toMatch(/<[^>]*\son(error|load|click|mouseover|focus)\s*=/i);
      expect(out).not.toMatch(/href="(?!https:\/\/)/i);
      expect(out).not.toMatch(/href="javascript:/i);
      for (const tag of out.match(/<\/?([a-z0-9]+)/gi) ?? []) {
        expect(["p", "br", "strong", "em", "ul", "li", "a", "div"]).toContain(tag.replace(/<\/?/, "").toLowerCase());
      }
    });

    it("the text of a refused link is shown as text, escaped", () => {
      const out = html("[clic](javascript:alert(1))");
      expect(out).not.toContain("<a ");
      expect(out).toContain("[clic](javascript:alert(1))");
    });

    it("escapes angle brackets and quotes in text", () => {
      const out = html("<script>alert(\"x\")</script>");
      expect(out).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    });
  });
});
