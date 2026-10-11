export type DeploymentEnvironment = "development" | "preview" | "production";

/**
 * Indexing is an explicit owner decision (the admin "Permitir indexación en buscadores" switch, persisted in the
 * database), independent from content completeness: missing legal or commercial data is shown to the admin as a
 * warning and never decides indexing on its own. Non-Production deployments are never indexed, and
 * CRUZIAL_INDEXING_FORCE_OFF=true is an emergency deployment-level override that closes everything.
 */
export function resolveIndexingPolicy({
  deploymentEnvironment,
  ownerEnabled,
  forceOff = false,
}: {
  deploymentEnvironment: DeploymentEnvironment;
  ownerEnabled: boolean;
  forceOff?: boolean;
}) {
  const mayIndex = deploymentEnvironment === "production" && ownerEnabled === true && forceOff !== true;

  return {
    index: mayIndex,
    follow: mayIndex,
  } as const;
}
