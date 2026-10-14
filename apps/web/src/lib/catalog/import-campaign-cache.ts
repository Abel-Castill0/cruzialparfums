/**
 * Cache policy of everything public that depends on which Import campaign is open: the tag is the primary
 * invalidation (every admin action that changes a campaign calls `revalidateImportCampaign`), the TTL is only the
 * fallback for a change made outside the admin (a SQL fix, a scheduled opening time passing).
 */
export const IMPORT_CAMPAIGN_CACHE_TAG = "import-campaign";
export const IMPORT_CAMPAIGN_REVALIDATE_SECONDS = 300;
