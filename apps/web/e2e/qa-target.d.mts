export declare const PRODUCTION_PROJECT_REFS: readonly string[];
export declare function parseEnvFile(text: string): Record<string, string>;
export declare function isProductionRef(ref: unknown): boolean;
export declare function validateQaTarget(env: Record<string, string | undefined>): {
  ref: string; apiUrl: string; publishable: string; secret: string; databaseUrl: string;
};
export declare function qaMarkerGuardSql(ref: string): string;
export declare function dockerPsqlArgs(): string[];
