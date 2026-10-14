import "server-only";

import { z } from "zod";
import { parseSafeHttpsUrl } from "./parse";

// Server-only on purpose: Zod's full build is ~23 KB gzip (83 KB minified), so a client component that imported this module
// would put it in the browser bundle; `server-only` makes that a build error instead of a silent regression.
export const RICH_TEXT_TITLE_MAX = 80;
export const RICH_TEXT_BODY_MAX = 2000;

export type RichTextProblem = "html" | "image" | "link" | "control";

/**
 * What the restricted Markdown refuses outright (the renderer would show it as plain text anyway; refusing tells the author):
 * raw HTML or autolinks (`<...>`), images (`![`), any link target that is not an absolute https URL, and control characters.
 */
export function findRichTextProblems(source: string): RichTextProblem[] {
  const problems = new Set<RichTextProblem>();
  if (/<\/?[a-zA-Z!?]/.test(source)) problems.add("html");
  if (/!\[/.test(source)) problems.add("image");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) problems.add("control");
  for (const match of source.matchAll(/\]\(([^)]*)\)/g)) {
    if (!parseSafeHttpsUrl(match[1]!.trim())) problems.add("link");
  }
  return [...problems];
}

const PROBLEM_MESSAGES: Record<RichTextProblem, string> = {
  html: "No se permite HTML ni etiquetas: usa solo texto, **negrita**, *cursiva*, listas con «- » y enlaces.",
  image: "No se permiten imágenes dentro del texto.",
  link: "Los enlaces deben ser direcciones completas que empiecen con https://.",
  control: "El texto contiene caracteres no permitidos.",
};

/** A link target (button, banner, FAQ source): https only. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048, "La dirección es demasiado larga.")
  .refine((value) => parseSafeHttpsUrl(value) !== null, "La dirección debe empezar con https://.");

/** Restricted Markdown body: at most 2000 characters and none of the refused constructs. */
export const restrictedMarkdownSchema = z
  .string()
  .max(RICH_TEXT_BODY_MAX, `El texto no puede pasar de ${RICH_TEXT_BODY_MAX} caracteres.`)
  .superRefine((value, ctx) => {
    for (const problem of findRichTextProblems(value)) ctx.addIssue({ code: "custom", message: PROBLEM_MESSAGES[problem] });
  });

/** The pair every editable text block starts from: a title (max 80) and a restricted Markdown body (max 2000). */
export const richTextFieldsSchema = z.object({
  title: z.string().trim().min(1, "Escribe un título.").max(RICH_TEXT_TITLE_MAX, `El título no puede pasar de ${RICH_TEXT_TITLE_MAX} caracteres.`),
  body: restrictedMarkdownSchema,
});

export type RichTextFields = z.infer<typeof richTextFieldsSchema>;

export type RichTextValidation =
  | { ok: true; value: RichTextFields }
  | { ok: false; errors: Record<string, string> };

/** Same result shape the other admin schemas use (`ValidationResult`): the first message per field. */
export function validateRichTextFields(input: unknown): RichTextValidation {
  const result = richTextFieldsSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
