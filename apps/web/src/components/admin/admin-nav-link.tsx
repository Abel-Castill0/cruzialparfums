"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

/** Highlights the current section in the admin nav. Purely presentational —
 * it never decides what the visitor is allowed to see or do; that stays
 * server-side in the unit layout/page. */
export function AdminNavLink({
  href,
  exact = false,
  children,
}: {
  href: Route;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
