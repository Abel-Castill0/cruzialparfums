/** Synthetic admin identities for the browser runners (local stack and hosted QA).
 * Real Auth password + TOTP enrolment through the public Auth API; MFA is never bypassed.
 * Identities are cached (mode 0600, git-ignored) so a run does not re-create users each time.
 */
import { randomBytes, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const IDENTITY_SPECS = [
  ["E2E_ADMIN", ["parfums", "import"]],
  ["E2E_PARFUMS_ADMIN", ["parfums"]],
  ["E2E_GATE_B_ADMIN", ["parfums", "import"]],
  ["E2E_PARFUMS_VIEWER", ["parfums"], "viewer"],
];

export function assertResult(result, label) {
  if (result.error) throw new Error(`${label} failed (${result.error.code ?? result.error.status ?? "unknown"}).`);
  return result.data;
}

export function totp(secret) {
  const bits = [...secret.replace(/=+$/, "")].map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}

/** Ensures every identity in IDENTITY_SPECS exists with its memberships and a verified TOTP factor,
 * then exports E2E_*_EMAIL/PASSWORD/TOTP_SECRET into `env`. `label` only shapes the synthetic email. */
export async function ensureIdentities({ createClient, apiUrl, publishableKey, admin, fixtureFile, env, label }) {
  const saved = existsSync(fixtureFile) ? JSON.parse(readFileSync(fixtureFile, "utf8")) : {};
  const units = assertResult(await admin.from("business_units").select("id,code"), "Read units");
  for (const [prefix, codes, role = "admin"] of IDENTITY_SPECS) {
    let identity = saved[prefix];
    if (identity && (await admin.auth.admin.getUserById(identity.id)).error) identity = null;
    if (identity) {
      // A database reset recreates `public` but keeps `auth.users`: re-grant memberships the user lost.
      const held = assertResult(await admin.from("admin_memberships").select("business_unit_id").eq("user_id", identity.id), "Read synthetic membership");
      const missing = units.filter(u => codes.includes(u.code) && !held.some(m => m.business_unit_id === u.id));
      if (missing.length) {
        assertResult(await admin.from("admin_memberships").insert(missing.map(u => ({ user_id: identity.id, business_unit_id: u.id, role, is_active: true }))), "Restore synthetic membership");
      }
    }
    if (!identity) {
      const email = `${label}-${randomBytes(8).toString("hex")}@example.test`;
      const password = `${randomBytes(24).toString("base64url")}aA1!`;
      const user = assertResult(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "Create synthetic user").user;
      assertResult(await admin.from("admin_memberships").insert(units.filter(u => codes.includes(u.code)).map(u => ({ user_id: user.id, business_unit_id: u.id, role, is_active: true }))), "Grant synthetic membership");
      const client = createClient(apiUrl, publishableKey, { auth: { persistSession: false } });
      assertResult(await client.auth.signInWithPassword({ email, password }), "Synthetic sign-in");
      const factor = assertResult(await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Synthetic browser verification" }), "Enroll synthetic TOTP");
      assertResult(await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }), "Verify synthetic TOTP");
      identity = { id: user.id, email, password, secret: factor.totp.secret };
      saved[prefix] = identity;
      writeFileSync(fixtureFile, JSON.stringify(saved), { mode: 0o600 });
    }
    env[`${prefix}_EMAIL`] = identity.email;
    env[`${prefix}_PASSWORD`] = identity.password;
    env[`${prefix}_TOTP_SECRET`] = identity.secret;
  }
}
