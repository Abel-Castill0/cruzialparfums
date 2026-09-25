import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

// Authorization for data/actions still happens independently in every page
// and Server Action under /admin/import — this layout only decides whether
// the shared navigation shell renders, and getAdminSession() is
// request-cached, so this costs no extra round trip.
export default async function ImportAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAdminSession();

  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");
  if (result.status !== "ok") redirect("/admin");

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "import",
  );
  if (!membership) redirect("/admin");

  const canSwitchToOtherUnit = result.session.memberships.some(
    (candidate) => candidate.businessUnitCode === "parfums",
  );

  return (
    <AdminShell
      unit="import"
      role={membership.role}
      email={result.session.email}
      canSwitchToOtherUnit={canSwitchToOtherUnit}
    >
      {children}
    </AdminShell>
  );
}
