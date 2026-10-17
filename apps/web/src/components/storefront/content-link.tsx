import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

/**
 * Renders a call-to-action an owner wrote for a content block: an internal path keeps the client router (and the
 * prefetching that comes with it), an absolute https URL is a plain external link. `javascript:`, `data:` and
 * protocol-relative URLs are already refused by the Zod schema (`isSafeContentHref`), so an unsafe destination can never
 * reach this component.
 */
export function ContentLink({ href, className, children }: { href: string; className?: string | undefined; children: ReactNode }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href as Route} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
