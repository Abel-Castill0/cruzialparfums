/**
 * Accessible name of a product card's photo link. WCAG 2.5.3 (Label in Name):
 * when the link shows the "Foto próximamente" placeholder text, that visible
 * text must be part of the name, otherwise speech-input users cannot activate
 * the link by saying what they see.
 */
export function productMediaLinkLabel(product: { brand: string; name: string; imageUrl?: string | null }): string {
  const base = `Ver ${product.brand} ${product.name}`;
  return product.imageUrl ? base : `${base} — Foto próximamente`;
}
