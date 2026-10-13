/**
 * Storefront wording for labels that come from catalog data. The data (legacy fixture, `specs.tag` in the database) says
 * "Designer"; the storefront says "Diseñador". The data itself is not edited.
 */
export function displayTag(tag: string): string {
  return tag.trim().toLowerCase() === "designer" ? "Diseñador" : tag;
}
