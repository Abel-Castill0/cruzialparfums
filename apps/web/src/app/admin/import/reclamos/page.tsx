import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminComplaintsRepository } from "@/domains/complaints/complaint-repository";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_TYPE_LABELS } from "@/domains/complaints/complaint-schema";
import { COMPLAINT_URGENCY_LABELS, isComplaintUrgency } from "@/domains/complaints/sla";
import {
  classifyComplaintUrgency,
  complaintStatusTone,
  complaintUrgencyTone,
  formatComplaintDate,
  isComplaintFilterStatus,
} from "@/domains/complaints/complaint-presentation";
import { formatRelativeLima } from "@/domains/admin/order-presentation";
import { ComplaintsInbox } from "@/components/admin/complaints-inbox";
import type { ComplaintListRow } from "@/components/admin/complaint-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Libro de Reclamaciones — Import" };

const PAGE_SIZE = 20;
const BASE_PATH = "/admin/import/reclamos";

export default async function AdminImportComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await getAdminSession();
  if (result.status === "not_configured") redirect("/admin");
  if (result.status === "unavailable") redirect("/admin");
  if (result.status === "signed_out") redirect("/admin/login");
  if (result.status === "no_membership") redirect("/admin");
  if (result.status === "mfa_challenge_required") redirect("/admin/mfa/challenge");
  if (result.status === "mfa_enrollment_required") redirect("/admin/mfa/enroll");

  const membership = result.session.memberships.find((candidate) => candidate.businessUnitCode === "import");
  if (!membership) redirect("/admin");
  const canWrite = membership.role === "admin";

  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const statusParam = typeof params.status === "string" && isComplaintFilterStatus(params.status) ? params.status : undefined;
  const urgencyParam = typeof params.urgency === "string" ? params.urgency : "";
  const urgency = isComplaintUrgency(urgencyParam) ? urgencyParam : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const filters = { search, status: statusParam ?? "", urgency: urgencyParam };
  const hrefForPage = (nextPage: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string") next.set(key, value);
    next.set("page", String(nextPage));
    return `${BASE_PATH}?${next.toString()}`;
  };

  if (!supabase) {
    return (
      <ComplaintsInbox
        unitName="Cruzial Import" basePath={BASE_PATH} canWrite={canWrite} filters={filters}
        counts={null} overdueCount={null} result={{ ok: false }} hrefForPage={hrefForPage}
      />
    );
  }

  const repository = new AdminComplaintsRepository(supabase, membership.businessUnitId);
  const [listResult, counts, overdueCount] = await Promise.all([
    repository.list({ search, status: statusParam, urgency }, { page, pageSize: PAGE_SIZE }),
    repository.countByStatus(),
    repository.countOverdue(),
  ]);

  const now = new Date();
  const inboxResult = listResult.ok
    ? {
        ok: true as const,
        total: listResult.data.total,
        page,
        totalPages: Math.max(1, Math.ceil(listResult.data.total / listResult.data.pageSize)),
        rows: listResult.data.items.map((entry): ComplaintListRow => {
          const entryUrgency = classifyComplaintUrgency(entry, now.getTime());
          return {
            id: entry.id,
            href: `${BASE_PATH}/${entry.id}`,
            fullName: entry.fullName,
            typeLabel: COMPLAINT_TYPE_LABELS[entry.complaintType],
            statusLabel: COMPLAINT_STATUS_LABELS[entry.status],
            statusTone: complaintStatusTone(entry.status),
            urgencyLabel: entry.status === "resolved" || entryUrgency === "normal" ? null : COMPLAINT_URGENCY_LABELS[entryUrgency],
            urgencyTone: complaintUrgencyTone(entryUrgency),
            createdRelative: formatRelativeLima(entry.createdAt, now),
            createdAbsolute: formatComplaintDate(entry.createdAt),
            deadlineLine: entry.status === "resolved" ? "Resuelto" : `Responder antes del ${formatComplaintDate(entry.dueAt)}`,
          };
        }),
      }
    : { ok: false as const };

  return (
    <ComplaintsInbox
      unitName="Cruzial Import"
      basePath={BASE_PATH}
      canWrite={canWrite}
      filters={filters}
      counts={counts}
      overdueCount={overdueCount}
      result={inboxResult}
      hrefForPage={hrefForPage}
    />
  );
}
