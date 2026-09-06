export function resolveCanonicalUrl(pathname: string, siteUrl?: string) {
  if (!siteUrl) return undefined;
  try {
    const base = new URL(siteUrl);
    if (base.protocol !== "https:" && base.hostname !== "localhost") {
      return undefined;
    }
    return new URL(pathname, base).toString();
  } catch {
    return undefined;
  }
}
