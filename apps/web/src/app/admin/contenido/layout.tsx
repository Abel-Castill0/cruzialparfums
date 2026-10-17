import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

// Content editing spans more than one store (the selector, Parfums and Import), so this area is not unit-scoped like
// /admin/parfums. The shell still needs a unit to render its navigation: it uses the first membership the signed-in user
// has, and the page below decides per section whether the user may edit it. Authorization for data/actions stays in the
// page and in every Server Action — this layout only decides whether the shell renders.
export default async function ContentAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAdminSession();

  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (result.status !== "ok") redirect("/admin");

  const parfums = result.session.memberships.find((candidate) => candidate.businessUnitCode === "parfums");
  const other = result.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  const primary = parfums ?? other;
  if (!primary) redirect("/admin");

  return (
    <AdminShell
      unit={primary.businessUnitCode}
      role={primary.role}
      email={result.session.email}
      canSwitchToOtherUnit={Boolean(parfums && other)}
    >
      {children}
    </AdminShell>
  );
}
