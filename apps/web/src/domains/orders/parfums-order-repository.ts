import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ParfumsOrderLineSnapshot, ValidatedParfumsOrderRequest } from "./parfums-order-request";

export type PersistedParfumsOrder = {
  orderId: string;
  orderNumber: string;
  created: boolean;
};

function stripV2ClientFields(lines: ParfumsOrderLineSnapshot[]) {
  return lines.map((line) => ({
    product_id: line.product_id,
    product_variant_id: line.product_variant_id,
    source: line.source,
    legacy_product_id: line.legacy_product_id,
    legacy_variant_id: line.legacy_variant_id,
    product_name: line.product_name,
    variant_label: line.variant_label,
    quantity: line.quantity,
    variant_snapshot: line.variant_snapshot,
  }));
}

export class ParfumsOrderRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** Only call with the server-derived capability identity. A submitted UUID
   * is never authority to read an order. The unit predicate is mandatory. */
  async findByRequestId(requestId: string): Promise<
    { ok: true; data: PersistedParfumsOrder | null } | { ok: false; message: string }
  > {
    const { data, error } = await this.supabase.from("orders")
      .select("id,order_number")
      .eq("business_unit_id", "11111111-1111-4111-8111-111111111111")
      .eq("request_id", requestId).maybeSingle();
    if (error) return { ok: false, message: "No pudimos verificar la solicitud anterior. Tu carrito se conserva." };
    return { ok: true, data: data ? { orderId: data.id, orderNumber: data.order_number, created: false } : null };
  }

  async create(request: ValidatedParfumsOrderRequest): Promise<
    { ok: true; data: PersistedParfumsOrder } | { ok: false; message: string }
  > {
    const allHaveDbIds = request.lines.every(
      (line) => line.product_id !== null && line.product_variant_id !== null,
    );
    const allHaveLegacy = request.lines.every(
      (line) => line.product_id === null && line.product_variant_id === null,
    );

    if (!allHaveDbIds && !allHaveLegacy) {
      return {
        ok: false,
        message: "No se admiten líneas mixtas en un mismo pedido.",
      };
    }

    if (allHaveDbIds) {
      const { data, error } = await this.supabase.rpc(
        "create_parfums_order_request_v2",
        {
          p_request_id: request.requestId,
          p_customer_snapshot: request.customerSnapshot,
          p_delivery_snapshot: request.deliverySnapshot,
          p_shipping_method_code: request.shippingMethodCode as unknown as string,
          p_lines: stripV2ClientFields(request.lines),
        },
      );
      if (error || !data?.[0]) {
        // Operational signal: server-derived request id (not PII) + the
        // Postgres code so a failed persistence is findable in the logs.
        console.error("[parfums-order] v2 persistence failed", {
          requestId: request.requestId,
          code: error?.code ?? "no_row",
        });
        return { ok: false, message: error?.code === "P2034"
          ? "La cantidad solicitada ya no está disponible. Actualiza tu carrito; no se registró el pedido."
          : "No pudimos registrar tu solicitud. Tu carrito se conserva para que puedas intentarlo nuevamente." };
      }
      return {
        ok: true,
        data: {
          orderId: data[0].order_id,
          orderNumber: data[0].order_number,
          created: data[0].created,
        },
      };
    }

    const { data, error } = await this.supabase.rpc(
      "create_parfums_order_request",
      {
        p_request_id: request.requestId,
        p_customer_snapshot: request.customerSnapshot,
        p_delivery_snapshot: request.deliverySnapshot,
        p_shipping_method_code: request.shippingMethodCode as unknown as string,
        p_lines: request.lines,
      },
    );
    if (error || !data?.[0]) {
      return { ok: false, message: "No pudimos registrar tu solicitud. Tu carrito se conserva para que puedas intentarlo nuevamente." };
    }
    return {
      ok: true,
      data: {
        orderId: data[0].order_id,
        orderNumber: data[0].order_number,
        created: data[0].created,
      },
    };
  }

  /** Stores the chosen 2 ml gift on an order that already exists. The database re-validates the rule (full bottle,
   * published Arabic perfume, not excluded) and the call is idempotent per order. */
  async attachGift(requestId: string, giftProductId: string): Promise<{ ok: true } | { ok: false; code: string }> {
    const { error } = await this.supabase.rpc("attach_parfums_order_gift", {
      p_request_id: requestId,
      p_gift_product_id: giftProductId,
    });
    return error ? { ok: false, code: error.code ?? "unknown" } : { ok: true };
  }
}
