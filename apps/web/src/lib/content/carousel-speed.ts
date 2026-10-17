/**
 * Drift speed of the discovery rail (`ProductMarquee`), in pixels per second.
 *
 * The owner tunes it from `/admin/contenido` (the `carousel` block of Parfums), stored as an integer in the block's
 * `content` JSONB and validated with the same bounds here, in `schemas.ts` (Zod) and in `app.validate_content_block`
 * (PostgreSQL). Kept in its own module, without `server-only`, because the client admin form and the client marquee need
 * these numbers too: `DEFAULT` is also the speed used when a rail has no stored value (the Import rail, or a Parfums
 * rail whose block was never saved).
 */
export const CAROUSEL_SPEED_MIN = 20;
export const CAROUSEL_SPEED_MAX = 60;
export const CAROUSEL_SPEED_STEP = 1;
export const CAROUSEL_SPEED_DEFAULT = 40;

export function isCarouselSpeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= CAROUSEL_SPEED_MIN && value <= CAROUSEL_SPEED_MAX;
}
