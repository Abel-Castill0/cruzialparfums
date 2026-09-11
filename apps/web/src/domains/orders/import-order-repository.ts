import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ValidatedImportOrderRequest } from "./import-order-request";

export type PersistedImportOrder = {
  orderId: string;
  orderNumber: string;
  created: boolean;
  subtotal: number;
  depositPercentage: number;
  depositAmount: number;
  campaignNumber: number;
};

export class ImportOrderRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(
    request: ValidatedImportOrderRequest,
  ): Promise<
    { ok: true; data: PersistedImportOrder } | { ok: false; message: string }
  > {
    const { data, error } = await this.supabase.rpc(
      "create_import_order_request",
      {
        p_request_id: request.requestId,
        p_customer: {
          name: request.customer.name,
          phone: request.customer.phone,
          district: request.customer.district,
          address: request.customer.address,
          note: request.customer.note,
        },
        p_delivery: {
          district: request.delivery.district,
          address: request.delivery.address,
          note: request.delivery.note,
        },
        p_lines: request.lines,
      },
    );

    if (error || !data?.[0]) {
      return {
        ok: false,
        message:
          "No pudimos registrar tu solicitud. Tu carrito se conserva para que puedas intentarlo nuevamente.",
      };
    }

    return {
      ok: true,
      data: {
        orderId: data[0].order_id,
        orderNumber: data[0].order_number,
        created: data[0].created,
        subtotal: Number(data[0].subtotal),
        depositPercentage: Number(data[0].deposit_percentage),
        depositAmount: Number(data[0].deposit_amount),
        campaignNumber: data[0].campaign_number,
      },
    };
  }
}
