import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BUSINESS_UNITS, type BusinessUnitCode } from "@/domains/platform/contracts";

const BUSINESS_UNIT_CODES: readonly BusinessUnitCode[] = BUSINESS_UNITS.map((unit) => unit.code);

function isBusinessUnitCode(value: unknown): value is BusinessUnitCode {
  return typeof value === "string" && (BUSINESS_UNIT_CODES as readonly string[]).includes(value);
}

/**
 * Server-side admin session and authorization.
 *
 * RLS is the enforcement layer in the database, but it is not a substitute for
 * authorization in the application: a handler still has to decide *whether to
 * run at all*. These helpers are that decision point, and they only ever read
 * the session from the server. A role, a unit id, or a "isAdmin" flag arriving
 * from the browser is input, never proof.
 */

export type AdminMembership = {
  businessUnitId: string;
  businessUnitCode: BusinessUnitCode;
  role: "admin" | "viewer";
};

export type AdminSession = {
  userId: string;
  email: string | null;
  memberships: AdminMembership[];
};

export type AdminSessionResult =
  | { status: "not_configured" }
  | { status: "unavailable" }
  | { status: "signed_out" }
  | { status: "no_membership"; userId: string; email: string | null }
  | { status: "ok"; session: AdminSession };

type MembershipRow = {
  business_unit_id: string;
  role: string;
  business_units: { code: string } | { code: string }[] | null;
};

function normalizeUnit(row: MembershipRow): AdminMembership | null {
  const unit = Array.isArray(row.business_units) ? row.business_units[0] : row.business_units;
  const code = unit?.code;
  if (!isBusinessUnitCode(code)) return null;
  if (row.role !== "admin" && row.role !== "viewer") return null;

  return {
    businessUnitId: row.business_unit_id,
    businessUnitCode: code,
    role: row.role,
  };
}

/**
 * Resolve the current administrator.
 *
 * Uses `getUser()`, which validates the token with the auth server, rather
 * than `getSession()`, which would trust whatever is in the cookie.
 */
export async function getAdminSession(): Promise<AdminSessionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "not_configured" };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user) {
    const missingSession =
      !userError ||
      userError.status === 401 ||
      userError.name === "AuthSessionMissingError";
    return { status: missingSession ? "signed_out" : "unavailable" };
  }

  // RLS on admin_memberships already limits this to the caller's own rows;
  // the explicit user_id filter documents the intent and keeps the query
  // correct even if that policy is ever widened.
  const { data, error } = await supabase
    .from("admin_memberships")
    .select("business_unit_id, role, business_units(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) return { status: "unavailable" };

  const memberships = (data as MembershipRow[] | null ?? [])
    .map(normalizeUnit)
    .filter((membership): membership is AdminMembership => membership !== null);

  if (memberships.length === 0) {
    return { status: "no_membership", userId: user.id, email: user.email ?? null };
  }

  return {
    status: "ok",
    session: { userId: user.id, email: user.email ?? null, memberships },
  };
}

/**
 * Authorize a mutation against one business unit.
 *
 * Call this before touching any admin data, passing the unit the *handler*
 * resolved — not one the browser supplied. Returns the membership so callers
 * can distinguish admin from viewer.
 */
export async function requireUnitAdmin(
  unitCode: BusinessUnitCode,
): Promise<{ ok: true; session: AdminSession; membership: AdminMembership } | { ok: false; reason: AdminSessionResult["status"] | "forbidden" }> {
  const result = await getAdminSession();
  if (result.status !== "ok") return { ok: false, reason: result.status };

  const membership = result.session.memberships.find(
    (candidate) => candidate.businessUnitCode === unitCode && candidate.role === "admin",
  );

  if (!membership) return { ok: false, reason: "forbidden" };

  return { ok: true, session: result.session, membership };
}
