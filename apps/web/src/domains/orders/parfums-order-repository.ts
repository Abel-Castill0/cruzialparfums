import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ValidatedParfumsOrderRequest } from "./parfums-order-request";

export type PersistedParfumsOrder = {
  orderId: string;
  orderNumber: string;
  created: boolean;
};

export class ParfumsOrderRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(request: ValidatedParfumsOrderRequest): Promise<
    { ok: true; data: PersistedParfumsOrder } | { ok: false; message: string }
  > {
    const { data, error } = await this.supabase.rpc("create_parfums_order_request", {
      p_request_id: request.requestId,
      p_customer_snapshot: request.customerSnapshot,
      p_delivery_snapshot: request.deliverySnapshot,
      // The generated PostgREST signature cannot express nullable function
      // arguments, although PostgreSQL accepts NULL for this text parameter.
      p_shipping_method_code: request.shippingMethodCode as unknown as string,
      p_lines: request.lines,
    });
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
