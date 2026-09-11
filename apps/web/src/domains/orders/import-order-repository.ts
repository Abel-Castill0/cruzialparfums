import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ValidatedImportOrderRequest } from "./import-order-request";

export type ImportOrderError =
  | { type: "cart_changed" }
  | { type: "campaign_unavailable" }
  | { type: "product_unavailable" }
  | { type: "duplicate_offer" }
  | { type: "ambiguous_customer" }
  | { type: "deposit_policy_missing" }
  | { type: "deposit_policy_ambiguity" }
  | { type: "invalid_input" }
  | { type: "unknown"; message: string };

export type PersistedImportOrder = {
  orderId: string;
  orderNumber: string;
  created: boolean;
  subtotal: number;
  depositPercentage: number;
  depositAmount: number;
  campaignNumber: number;
};

function mapImportOrderError(error: { code?: string; message: string }): ImportOrderError {
  switch (error.code) {
    case "P2011":
      return { type: "cart_changed" };
    case "P2012":
      return { type: "duplicate_offer" };
    case "P2013":
      return { type: "ambiguous_customer" };
    case "P2014":
      return { type: "deposit_policy_missing" };
    case "P2015":
      return { type: "deposit_policy_ambiguity" };
    case "P2016":
      return { type: "campaign_unavailable" };
    case "P2017":
      return { type: "product_unavailable" };
    case "22023":
      return { type: "invalid_input" };
    default:
      return { type: "unknown", message: error.message };
  }
}

export class ImportOrderRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(
    request: ValidatedImportOrderRequest,
  ): Promise<
    | { ok: true; data: PersistedImportOrder }
    | { ok: false; error: ImportOrderError }
  > {
    const { data, error } = await this.supabase.rpc(
      "create_import_order_request",
      {
        p_request_id: request.requestId,
        p_customer: {
          name: request.customer.name,
          phone: request.customer.phone,
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
        error: error
          ? mapImportOrderError(error)
          : { type: "unknown", message: "No response from server" },
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
