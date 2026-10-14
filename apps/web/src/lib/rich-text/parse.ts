/**
 * Restricted Markdown for editable copy (FAQ, conditions, banners). It is deliberately tiny:
 *   paragraphs (blank line), line breaks (a single newline), `- ` lists, **bold**, *italic*, [text](https://url)
 * and nothing else. There is no HTML anywhere in it: the parser builds a small tree, the renderer turns the tree into React
 * elements (React escapes every text node), and the only attribute that carries author data is an `https` link target that
 * already passed `parseSafeHttpsUrl`. Raw HTML, images, scripts and every other scheme are never produced; the Zod schema
 * (`schema.ts`) additionally refuses them at the door so an author is told instead of silently losing text.
 */

export type RichInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: RichInline[] }
  | { type: "em"; children: RichInline[] }
  | { type: "link"; href: string; children: RichInline[] }
  | { type: "break" };

export type RichBlock =
  | { type: "paragraph"; children: RichInline[] }
  | { type: "list"; items: RichInline[][] };

const MAX_URL_LENGTH = 2048;

/** A link target an author may use: an absolute `https` URL with a host, no spaces, no credentials. Anything else is refused. */
export function parseSafeHttpsUrl(raw: string): string | null {
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH || /[\s\u0000-\u001f\u007f<>"'`\\]/.test(raw)) return null;
  if (!raw.toLowerCase().startsWith("https://")) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const LINK = /^\[([^\]\n]+)\]\(([^)\s]*)\)/;

function pushText(out: RichInline[], value: string) {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

/** Closing marker search that skips escaped characters. Returns -1 when the marker never closes. */
function closing(source: string, from: number, marker: string): number {
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "\\") {
      i += 1;
      continue;
    }
    if (source.startsWith(marker, i)) {
      // A single `*` must not close on the first star of a `**`; a `**` closes on the LAST two stars of a run (`***`).
      if (marker === "*" && source[i + 1] === "*") continue;
      if (marker === "**" && source[i + 2] === "*") continue;
      return i;
    }
  }
  return -1;
}

export function parseInline(source: string): RichInline[] {
  const out: RichInline[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    if (char === "\\" && i + 1 < source.length && /[\\*_[\]()#<>-]/.test(source[i + 1]!)) {
      pushText(out, source[i + 1]!);
      i += 2;
      continue;
    }
    if (source.startsWith("**", i)) {
      const end = closing(source, i + 2, "**");
      if (end > i + 2) {
        out.push({ type: "strong", children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (char === "*" && source[i + 1] !== " " && source[i + 1] !== "*") {
      const end = closing(source, i + 1, "*");
      if (end > i + 1) {
        out.push({ type: "em", children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (char === "[") {
      const match = LINK.exec(source.slice(i));
      const href = match ? parseSafeHttpsUrl(match[2]!) : null;
      if (match && href) {
        out.push({ type: "link", href, children: parseInline(match[1]!) });
        i += match[0].length;
        continue;
      }
    }
    pushText(out, char);
    i += 1;
  }
  return out;
}

const LIST_ITEM = /^[-*] +(.+)$/;

function withLineBreaks(lines: string[]): RichInline[] {
  const out: RichInline[] = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push({ type: "break" });
    out.push(...parseInline(line.trim()));
  });
  return out;
}

export function parseRestrictedMarkdown(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  let items: RichInline[][] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: withLineBreaks(paragraph) });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ type: "list", items });
    items = [];
  };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const item = LIST_ITEM.exec(line.trim());
    if (item) {
      flushParagraph();
      items.push(parseInline(item[1]!.trim()));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
