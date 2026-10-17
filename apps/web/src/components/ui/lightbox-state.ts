export type LightboxState = { activeIndex: number | null };

export type LightboxAction =
  | { type: "open"; index: number }
  | { type: "close" }
  | { type: "previous" }
  | { type: "next" };

export function lightboxActionForKey(key: string): LightboxAction["type"] | null {
  if (key === "Escape") return "close";
  if (key === "ArrowLeft") return "previous";
  if (key === "ArrowRight") return "next";
  return null;
}

export const CLOSED_LIGHTBOX: LightboxState = { activeIndex: null };

export function lightboxReducer(state: LightboxState, action: LightboxAction, imageCount: number): LightboxState {
  if (action.type === "close" || imageCount < 1) return CLOSED_LIGHTBOX;
  if (action.type === "open") return { activeIndex: Math.max(0, Math.min(action.index, imageCount - 1)) };
  if (state.activeIndex === null) return state;

  const offset = action.type === "next" ? 1 : -1;
  return { activeIndex: (state.activeIndex + offset + imageCount) % imageCount };
}
