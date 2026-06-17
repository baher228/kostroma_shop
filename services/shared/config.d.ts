export declare function parsePort(value: string | undefined, fallback?: number): number;
export declare function parseBoolean(value: string | undefined, fallback: boolean): boolean;
export declare function trimToUndefined(value: string | undefined): string | undefined;
export declare function insecureFallback(options: {
  value: string | undefined;
  fallback: string;
  label: string;
  isProduction: boolean;
}): string;
export declare function resolveCorsOrigin(options: { value: string | undefined; isProduction: boolean }): string;
export declare function requireDatabaseSetting(options: {
  value: string | undefined;
  label: string;
  fallback?: string;
  isProduction: boolean;
}): string;
