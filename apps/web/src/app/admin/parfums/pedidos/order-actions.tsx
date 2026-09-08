"use client";

import { useState } from "react";
import styles from "../productos/page.module.css";

/** "Copiar referencia" / phone-copy fallback. Plain clipboard write, no
 * server round-trip and no mutation — Phase 4E2 is read-only. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the value stays
      // visible on the page for a manual copy, so this is not a dead end.
    }
  }

  return (
    <button type="button" className={styles.secondaryButton} onClick={handleCopy}>
      {copied ? "Copiado ✓" : label}
    </button>
  );
}
