"use client";

import { useEffect, useRef, useState } from "react";
import { adminButtonClass } from "./admin-ui";

/** Plain clipboard write — no server round-trip, no mutation. If the
 * browser denies clipboard access the value stays visible on the page for a
 * manual copy, so this is never a dead end. */
export function CopyButton({ value, label, copiedLabel = "Copiado ✓" }: { value: string; label: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className={adminButtonClass("secondary")} onClick={handleCopy}>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
