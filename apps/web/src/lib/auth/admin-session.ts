import "server-only";

import { cache } from "react";
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
  | { status: "mfa_enrollment_required"; userId: string; email: string | null }
  | { status: "mfa_challenge_required"; userId: string; email: string | null }
  | { status: "ok"; session: AdminSession };

/**
 * A session that is authenticated with an active membership but has not yet
 * reached aal2. Deliberately narrower than AdminSession: it carries no
 * memberships and grants no business-data access on its own. It exists only
 * so /admin/mfa/enroll, /admin/mfa/challenge and /admin/reset-password can
 * render for a user who is legitimately partway through the MFA flow,
 * without weakening getAdminSession() to accept aal1 as authorization.
 */
export type AdminPreMfaSession = {
  userId: string;
  email: string | null;
  currentLevel: "aal1" | "aal2";
  nextLevel: "aal1" | "aal2";
};

export type AdminPreMfaSessionResult =
  | { status: "not_configured" }
  | { status: "unavailable" }
  | { status: "signed_out" }
  | { status: "no_membership" }
  | { status: "ready"; session: AdminPreMfaSession };

type MembershipRow = {
  business_unit_id: string;
  role: string;
  business_units: { code: string } | null;
};

function normalizeUnit(row: MembershipRow): AdminMembership | null {
  const code = row.business_units?.code;
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
 *
 * A membership alone is not enough to reach "ok": every admin/viewer surface
 * requires the session to also be at Authenticator Assurance Level 2 (a
 * verified TOTP factor). This mirrors the database layer — app.is_admin_for
 * and app.can_read_unit independently require aal2 — so a stolen aal1 token
 * gains nothing here even if it could somehow skip this check and hit
 * PostgREST directly. `getAuthenticatorAssuranceLevel()` failing is treated
 * as "unavailable", never as "ok": this function fails closed.
 */
// Wrapped in React's per-request cache: an admin route's layout resolves the
// session for the shared shell (nav/unit-switcher) and the page resolves it
// again for its own authorization/data queries — cache() collapses those
// into one actual auth+DB round trip per request instead of two.
export const getAdminSession = cache(async (): Promise<AdminSessionResult> => {
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

  const memberships = (data ?? [])
    .map(normalizeUnit)
    .filter((membership): membership is AdminMembership => membership !== null);

  if (memberships.length === 0) {
    return { status: "no_membership", userId: user.id, email: user.email ?? null };
  }

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) return { status: "unavailable" };

  if (aal.currentLevel === "aal2") {
    return {
      status: "ok",
      session: { userId: user.id, email: user.email ?? null, memberships },
    };
  }

  if (aal.nextLevel === "aal2") {
    return { status: "mfa_challenge_required", userId: user.id, email: user.email ?? null };
  }

  if (aal.nextLevel === "aal1") {
    return { status: "mfa_enrollment_required", userId: user.id, email: user.email ?? null };
  }

  // Any other combination (e.g. currentLevel "aal2" with nextLevel "aal1",
  // meaning a factor was just disabled and the JWT is stale) is not a case
  // this application grants access for. Fail closed.
  return { status: "unavailable" };
});

/**
 * Resolve a session for the narrow set of pages a partially-authenticated
 * admin must reach before getAdminSession() can return "ok": MFA enrollment,
 * MFA challenge, and password reset. Requires a valid getUser() and an
 * active own membership, but explicitly does not require aal2 — that is the
 * entire point of this helper existing separately from getAdminSession().
 *
 * This grants no business-data access: callers must not use the returned
 * session for anything beyond deciding whether to render one of those three
 * pages.
 */
export async function getAdminPreMfaSession(): Promise<AdminPreMfaSessionResult> {
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

  const { count, error } = await supabase
    .from("admin_memberships")
    .select("business_unit_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) return { status: "unavailable" };
  if (!count) return { status: "no_membership" };

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) return { status: "unavailable" };

  return {
    status: "ready",
    session: {
      userId: user.id,
      email: user.email ?? null,
      currentLevel: aal.currentLevel as "aal1" | "aal2",
      nextLevel: aal.nextLevel as "aal1" | "aal2",
    },
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
