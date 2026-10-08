import type { Metadata } from "next";
import { describeParfumsDelivery } from "@/domains/orders/parfums-delivery";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminParfumsOrdersRepository } from "@/domains/admin-parfums/orders-repository";
import { isOrderAgeBucket } from "@/domains/admin/order-age";
import {
  formatLimaDateTime,
  formatMoney,
  formatRelativeLima,
  orderStatusPresentation,
} from "@/domains/admin/order-presentation";
import { OrdersInbox } from "@/components/admin/orders-inbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pedidos" };

const PAGE_SIZE = 20;
const BASE_PATH = "/admin/parfums/pedidos";

export default async function AdminParfumsOrdersPage({
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

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === "parfums",
  );
  if (!membership) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const statusParam = typeof params.status === "string" ? params.status : "";
  const ageParam = typeof params.age === "string" ? params.age : "";
  const page = Math.max(1, Number(params.page) || 1);
  const filters = { search, status: statusParam, age: ageParam };
  const hrefForPage = (nextPage: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string") next.set(key, value);
    next.set("page", String(nextPage));
    return `${BASE_PATH}?${next.toString()}`;
  };
  const isAdmin = membership.role === "admin";

  if (!supabase) {
    return (
      <OrdersInbox unitName="Cruzial Parfums" basePath={BASE_PATH} isAdmin={isAdmin} filters={filters}
        counts={null} result={{ ok: false }} hrefForPage={hrefForPage} />
    );
  }

  const repository = new AdminParfumsOrdersRepository(supabase, membership.businessUnitId);
  const [listResult, counts] = await Promise.all([
    repository.list(
      {
        search,
        status: statusParam || undefined,
        age: isOrderAgeBucket(ageParam) ? ageParam : undefined,
      },
      { page, pageSize: PAGE_SIZE },
    ),
    repository.countByStatus(),
  ]);

  const now = new Date();
  const inbox = listResult.ok
    ? {
        ok: true as const,
        total: listResult.data.total,
        page,
        totalPages: Math.max(1, Math.ceil(listResult.data.total / listResult.data.pageSize)),
        rows: listResult.data.items.map((order) => {
          const status = orderStatusPresentation("parfums", order.status);
          return {
            id: order.id,
            href: `${BASE_PATH}/${order.id}`,
            orderNumber: order.orderNumber,
            customerName: order.customer.name,
            customerPhone: order.customer.phone,
            district: order.delivery.district,
            createdRelative: formatRelativeLima(order.createdAt, now),
            createdAbsolute: formatLimaDateTime(order.createdAt),
            total: formatMoney(order.subtotalAmount, order.currency),
            lineCount: order.lineCount,
            statusLabel: status.label,
            statusTone: status.tone,
            situation: status.situation,
            context: [describeParfumsDelivery(order.delivery.delivery).methodLabel],
          };
        }),
      }
    : { ok: false as const };

  return (
    <OrdersInbox
      unitName="Cruzial Parfums"
      basePath={BASE_PATH}
      isAdmin={isAdmin}
      filters={filters}
      counts={counts}
      result={inbox}
      hrefForPage={hrefForPage}
    />
  );
}
