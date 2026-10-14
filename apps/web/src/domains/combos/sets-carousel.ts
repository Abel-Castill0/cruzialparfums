/**
 * Rules of the carousel of sets at the bottom of /parfums/combos: three sets in view, moving one set every 4 seconds.
 * Pure on purpose: the component only feeds it the viewport and the visitor's state.
 */

/** How long each position stays before the carousel moves on by itself. Code-level setting, not an admin option. */
export const SETS_ROTATION_MS = 4000;

export const SETS_VISIBLE_DESKTOP = 3;
export const SETS_VISIBLE_TABLET = 2;
export const SETS_VISIBLE_PHONE = 1;

/** Sets in view for a viewport width: 3 from 1024px, 2 from 640px, 1 below. */
export function setsVisibleFor(width: number): number {
  if (width >= 1024) return SETS_VISIBLE_DESKTOP;
  if (width >= 640) return SETS_VISIBLE_TABLET;
  return SETS_VISIBLE_PHONE;
}

/** Highest position of the window: with 5 sets and 3 in view the window can start at 0, 1 or 2. */
export function maxSetsIndex(total: number, visible: number): number {
  return Math.max(0, total - visible);
}

/** Next position; after the last one the carousel returns to the first. */
export function nextSetsIndex(index: number, total: number, visible: number): number {
  return index >= maxSetsIndex(total, visible) ? 0 : index + 1;
}

/** Previous position; before the first one it goes to the last. */
export function previousSetsIndex(index: number, total: number, visible: number): number {
  return index <= 0 ? maxSetsIndex(total, visible) : index - 1;
}

/** Keeps a position valid when the number of visible sets changes (rotating the phone, resizing). */
export function clampSetsIndex(index: number, total: number, visible: number): number {
  return Math.min(Math.max(0, index), maxSetsIndex(total, visible));
}

/**
 * Whether the carousel should be counting down. It only moves when some sets are out of view, never under
 * prefers-reduced-motion, and not while the visitor has taken over or the pointer/focus is on it (WCAG 2.2.2).
 */
export function isSetsRotating(state: {
  total: number;
  visible: number;
  reducedMotion: boolean;
  stopped: boolean;
  holding: boolean;
}): boolean {
  return state.total > state.visible && !state.reducedMotion && !state.stopped && !state.holding;
}
