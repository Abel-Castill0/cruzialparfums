import "server-only";

import type { CarouselContent, ContentBlockType, HeroContent, TextBannerContent } from "./schemas";

/**
 * The closed registry of editable sections.
 *
 * The admin never creates a section: it only edits the ones this file declares, so a block can never point at a section no
 * page renders (docs/content-editor-architecture.md §5.2). `fallback` is the content the page shows when no row exists —
 * the copy that lives in the TSX today — so an empty database renders exactly the current site.
 *
 * Adding a section is a code change here plus the component that consumes it, never an admin action.
 */

export const CONTENT_PAGES = ["home", "parfums", "import"] as const;
export type ContentPageSlug = (typeof CONTENT_PAGES)[number];

export type ContentUnit = "parfums" | "import";

export const CONTENT_PAGE_LABELS: Record<ContentPageSlug, string> = {
  home: "Inicio (selector de tiendas)",
  parfums: "Cruzial Parfums · inicio",
  import: "Cruzial Import · inicio",
};

export type ContentSection =
  | { page: ContentPageSlug; unit: ContentUnit; key: string; blockType: "hero"; label: string; description: string; fallback: HeroContent }
  | { page: ContentPageSlug; unit: ContentUnit; key: string; blockType: "text_banner"; label: string; description: string; fallback: TextBannerContent }
  | { page: ContentPageSlug; unit: ContentUnit; key: string; blockType: "carousel"; label: string; description: string; fallback: CarouselContent };

/** Fallbacks mirror the current TSX copy verbatim, so "no rows" is a zero-regression render. */
export const CONTENT_SECTIONS: readonly ContentSection[] = [
  {
    page: "home",
    unit: "parfums",
    key: "door_parfums",
    blockType: "text_banner",
    label: "Puerta «Parfums»",
    description: "El título y el texto de la puerta que lleva a la tienda de perfumes. El botón «Entrar» y su destino son fijos.",
    fallback: {
      title: "Parfums",
      body: "Decants, frascos y combos de perfumería árabe, de diseñador y nicho.",
    },
  },
  {
    page: "home",
    unit: "parfums",
    key: "door_import",
    blockType: "text_banner",
    label: "Puerta «Import»",
    description: "El título y el texto de la puerta que lleva a los consolidados de Import. Cuando la campaña está cerrada se muestra el aviso de estado en lugar del texto. El botón «Entrar» y su destino son fijos.",
    fallback: {
      title: "Import",
      body: "Consolidados de perfumería: compra grupal por campaña.",
    },
  },
  {
    page: "parfums",
    unit: "parfums",
    key: "hero",
    blockType: "hero",
    label: "Portada (hero)",
    description: "El titular y el botón principal de la portada de Parfums.",
    fallback: { title: "Perfumería de descubrimiento.", ctaLabel: "Explorar catálogo", ctaHref: "/parfums/catalogo" },
  },
  {
    page: "parfums",
    unit: "parfums",
    key: "destacados",
    blockType: "carousel",
    label: "Carrusel de destacados",
    description: "La tira de fragancias de la portada. Si eliges productos, se muestran en el orden que definas; si no, se usa la selección automática actual.",
    fallback: { title: "Fragancias para descubrir." },
  },
  {
    page: "parfums",
    unit: "parfums",
    key: "craft",
    blockType: "text_banner",
    label: "Bloque «Del frasco a tu piel»",
    description: "El titular, la línea de apoyo y el enlace al bloque de preparación de la portada.",
    fallback: {
      title: "Del frasco original a tu piel.",
      body: "Perfumes sellados y una preparación cuidadosa en cada pedido.",
      ctaLabel: "Conoce Cruzial",
      ctaHref: "/parfums/nosotros",
    },
  },
  {
    page: "parfums",
    unit: "parfums",
    key: "tiktok",
    blockType: "text_banner",
    label: "Enlace a TikTok",
    description: "El titular y el texto del bloque que invita a seguir el perfil de TikTok. Solo se usa cuando no hay video de portada configurado.",
    fallback: {
      title: "Cruzial en TikTok",
      body: "Sigue el perfil oficial de Cruzial para ver sus publicaciones en video.",
    },
  },
  {
    page: "import",
    unit: "import",
    key: "process",
    blockType: "text_banner",
    label: "Bloque «Pedidos que llegan a tu puerta»",
    description: "El titular y el texto que introducen la galería de preparación de Import.",
    fallback: {
      title: "Pedidos que llegan a tu puerta",
      body: "Cada fragancia se revisa y prepara con cuidado antes de llegar a ti.",
    },
  },
];

export function sectionsForPage(page: ContentPageSlug): readonly ContentSection[] {
  return CONTENT_SECTIONS.filter((section) => section.page === page);
}

export function findSection(page: ContentPageSlug, key: string): ContentSection | null {
  return CONTENT_SECTIONS.find((section) => section.page === page && section.key === key) ?? null;
}

export function isContentPageSlug(value: unknown): value is ContentPageSlug {
  return typeof value === "string" && (CONTENT_PAGES as readonly string[]).includes(value);
}

export function isContentBlockType(value: unknown): value is ContentBlockType {
  return value === "hero" || value === "text_banner" || value === "carousel";
}
