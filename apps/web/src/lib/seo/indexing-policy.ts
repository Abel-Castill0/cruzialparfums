export type DeploymentEnvironment = "development" | "preview" | "production";

export function resolveIndexingPolicy({
  deploymentEnvironment,
  cutoverApproved,
}: {
  deploymentEnvironment: DeploymentEnvironment;
  cutoverApproved: boolean;
}) {
  const mayIndex =
    deploymentEnvironment === "production" && cutoverApproved === true;

  return {
    index: mayIndex,
    follow: mayIndex,
  } as const;
}
