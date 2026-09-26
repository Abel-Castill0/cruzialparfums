import "server-only";
import { safeSecretEqual } from "./webhook";

export function automationAuthorized(header: string | null, secret: string | undefined): boolean {
  return !!secret && secret.length >= 32 && !!header && safeSecretEqual(header, `Bearer ${secret}`);
}
