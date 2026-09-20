export type ProductMediaAsset = {
  url: string;
};

export interface ProductMediaSource {
  resolve(legacyPath: string | null): ProductMediaAsset | null;
}

export class LegacyProductionMediaSource implements ProductMediaSource {
  constructor(
    private readonly baseUrl =
      "https://abel-castill0.github.io/cruzialparfums/",
  ) {}

  resolve(legacyPath: string | null): ProductMediaAsset | null {
    if (!legacyPath) return null;

    const normalizedPath = legacyPath.replaceAll("\\", "/").replace(/^\/+/, "");
    if (normalizedPath.split("/").includes("..")) {
      throw new Error(`Unsafe legacy media path: ${legacyPath}`);
    }

    const encodedPath = normalizedPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return { url: new URL(encodedPath, this.baseUrl).toString() };
  }
}
