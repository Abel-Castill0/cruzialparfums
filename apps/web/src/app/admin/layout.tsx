import type { Metadata } from "next";

// Admin is never indexed, regardless of the public cutover/indexing policy
// resolved in the root layout — this overrides it unconditionally for
// every /admin/* route.
export const metadata: Metadata = {
  title: { default: "Cruzial Admin", template: "%s — Cruzial Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
