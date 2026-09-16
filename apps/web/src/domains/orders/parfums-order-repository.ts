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
  return lines.map(({ currency: _c, unit_price_amount: _u, ...rest }) => rest);
}

export class ParfumsOrderRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

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
}
