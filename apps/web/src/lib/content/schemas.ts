import "server-only";

import { z } from "zod";
import { parseSafeHttpsUrl } from "@/lib/rich-text/parse";
import { RICH_TEXT_BODY_MAX, RICH_TEXT_TITLE_MAX, restrictedMarkdownSchema } from "@/lib/rich-text/schema";

/**
 * Zod schemas for editable content blocks (`content_blocks.content`).
 *
 * One schema per `block_type`; the database repeats the same checks in `app.validate_content_block`, so a block is
 * validated when an admin saves it, when the public page reads it (a corrupt row is never painted) and again by
 * PostgreSQL. The block types are a closed set: `hero`, `text_banner`, `carousel`.
 *
 * Server-only, like `lib/rich-text/schema.ts`: Zod's full build must never reach the browser bundle. The admin form is a
 * plain form and the Server Action it posts to is where these schemas run.
 */

export const CONTENT_BLOCK_TYPES = ["hero", "text_banner", "carousel"] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

const CTA_LABEL_MAX = 30;

/**
 * A link the owner may set on a block: an internal path (`/parfums/catalogo`, never protocol-relative `//host`) or an
 * absolute `https` URL. `javascript:`, `data:`, `http:` and anything else is refused so a stored link can never be unsafe.
 */
export function isSafeContentHref(raw: string): boolean {
  const value = raw.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  return parseSafeHttpsUrl(value) !== null;
}

export const contentHrefSchema = z
  .string()
  .trim()
  .min(1, "Escribe el destino del botón.")
  .max(2048, "La dirección es demasiado larga.")
  .refine(isSafeContentHref, "Usa una ruta interna que empiece con / o una dirección https://.");

/**
 * Plain one-line copy: no `<` (a tag the author did not mean) and no control characters. Tab, newline and carriage return
 * are deliberately allowed (they are whitespace, not control data), exactly like `findRichTextProblems`, so markdown lists
 * in a banner body stay usable; the database repeats this same set.
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function plainText(max: number, message: string) {
  return z
    .string()
    .trim()
    .min(1, "Escribe el texto.")
    .max(max, message)
    .refine((value) => !value.includes("<"), "El texto no admite el símbolo <.")
    .refine((value) => !CONTROL_CHARACTERS.test(value), "El texto contiene caracteres no permitidos.");
}

/** `ctaLabel` and `ctaHref` are optional but must arrive together: a button with no destination is a dead button. */
function requirePairedCta(value: { ctaLabel?: string | undefined; ctaHref?: string | undefined }, ctx: z.RefinementCtx) {
  if (value.ctaLabel && !value.ctaHref) {
    ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Escribe el destino del botón." });
  }
  if (value.ctaHref && !value.ctaLabel) {
    ctx.addIssue({ code: "custom", path: ["ctaLabel"], message: "Escribe el texto del botón." });
  }
}

export const heroContentSchema = z
  .strictObject({
    title: plainText(RICH_TEXT_TITLE_MAX, `El título no puede pasar de ${RICH_TEXT_TITLE_MAX} caracteres.`),
    ctaLabel: plainText(CTA_LABEL_MAX, `El botón no puede pasar de ${CTA_LABEL_MAX} caracteres.`).optional(),
    ctaHref: contentHrefSchema.optional(),
  })
  .superRefine(requirePairedCta);

export const textBannerContentSchema = z
  .strictObject({
    title: plainText(RICH_TEXT_TITLE_MAX, `El título no puede pasar de ${RICH_TEXT_TITLE_MAX} caracteres.`),
    body: restrictedMarkdownSchema.min(1, "Escribe el texto."),
    ctaLabel: plainText(CTA_LABEL_MAX, `El botón no puede pasar de ${CTA_LABEL_MAX} caracteres.`).optional(),
    ctaHref: contentHrefSchema.optional(),
  })
  .superRefine(requirePairedCta);

export const carouselContentSchema = z.strictObject({
  title: plainText(RICH_TEXT_TITLE_MAX, `El título no puede pasar de ${RICH_TEXT_TITLE_MAX} caracteres.`).optional(),
});

export type HeroContent = z.infer<typeof heroContentSchema>;
export type TextBannerContent = z.infer<typeof textBannerContentSchema>;
export type CarouselContent = z.infer<typeof carouselContentSchema>;
export type BlockContent = HeroContent | TextBannerContent | CarouselContent;

/** The schema of each block type. A record keyed by the closed set, so a new type is a compile error until it is added. */
export const contentSchemas = {
  hero: heroContentSchema,
  text_banner: textBannerContentSchema,
  carousel: carouselContentSchema,
} satisfies Record<ContentBlockType, z.ZodType>;

export function contentSchemaFor<T extends ContentBlockType>(type: T) {
  return contentSchemas[type];
}

export type BlockContentInput = unknown;

export type BlockContentValidation =
  | { ok: true; value: BlockContent }
  | { ok: false; errors: Record<string, string> };

/** First message per field, the same result shape the rest of the admin forms use. */
export function validateBlockContent(type: ContentBlockType, input: BlockContentInput): BlockContentValidation {
  const result = contentSchemas[type].safeParse(input);
  if (result.success) return { ok: true, value: result.data as BlockContent };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}

/**
 * Public read: a stored row that does not match its schema is treated as absent (the page uses its fallback). This is why a
 * hand-edited or legacy row can never paint a broken block or throw during render.
 */
export function parseBlockContent<T extends ContentBlockType>(type: T, input: BlockContentInput): z.infer<(typeof contentSchemas)[T]> | null {
  const result = contentSchemas[type].safeParse(input);
  return result.success ? (result.data as z.infer<(typeof contentSchemas)[T]>) : null;
}

export const CONTENT_MAX = { title: RICH_TEXT_TITLE_MAX, body: RICH_TEXT_BODY_MAX, ctaLabel: CTA_LABEL_MAX } as const;
