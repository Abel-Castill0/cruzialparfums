/** Cache identity of the public delivery-zone read. Kept free of server-only imports so tests and admin actions can share it. */
export const DELIVERY_ZONES_CACHE_TAG = "delivery-zones";
/** Fallback TTL for changes made outside the admin (SQL). The admin expires the tag on every save. */
export const DELIVERY_ZONES_REVALIDATE_SECONDS = 300;
