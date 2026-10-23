import {
  type RepositoryBlobResult,
  type RepositoryComparisonResult,
  type RepositoryIdentity,
  type RepositoryReadLimits,
  type RepositoryRevision,
  type RepositoryTreeResult,
  repositoryBlobResultSchema,
  repositoryComparisonResultSchema,
  repositoryReadLimitsSchema,
  repositoryTreeResultSchema,
} from "@traceframe/schema/repository";

export type RepositoryReadRequest = {
  repository: RepositoryIdentity;
  revision: RepositoryRevision;
  limits: RepositoryReadLimits;
};

export type RepositoryProvider = {
  tree(request: RepositoryReadRequest): Promise<RepositoryTreeResult>;
  blob(request: RepositoryReadRequest & { path: string }): Promise<RepositoryBlobResult>;
  comparison(
    request: RepositoryReadRequest & { base: RepositoryRevision; head: RepositoryRevision },
  ): Promise<RepositoryComparisonResult>;
};

function withinBounds<
  T extends RepositoryTreeResult | RepositoryBlobResult | RepositoryComparisonResult,
>(result: T, limits: RepositoryReadLimits): T {
  if ("entries" in result && result.entries.length > limits.maxEntries)
    throw new Error("Provider tree response exceeded the requested entry limit");
  if ("paths" in result && result.paths.length > limits.maxEntries)
    throw new Error("Provider comparison response exceeded the requested entry limit");
  if ("content" in result) {
    const content = result.content;
    if (
      content !== null &&
      ((content.originalBytes !== null && content.originalBytes > limits.maxBytes) ||
        (content.text !== null && Buffer.byteLength(content.text, "utf8") > limits.maxBytes))
    )
      throw new Error("Provider blob response exceeded the requested byte limit");
  }
  return result;
}

/**
 * Validates a provider response at the trust boundary and caps the caller's
 * request before it reaches a local or remote implementation.
 */
export function boundedProvider(provider: RepositoryProvider, limits: RepositoryReadLimits) {
  const checked = repositoryReadLimitsSchema.parse(limits);
  return {
    async tree(request: Omit<RepositoryReadRequest, "limits">): Promise<RepositoryTreeResult> {
      return withinBounds(
        repositoryTreeResultSchema.parse(await provider.tree({ ...request, limits: checked })),
        checked,
      );
    },
    async blob(
      request: Omit<RepositoryReadRequest, "limits"> & { path: string },
    ): Promise<RepositoryBlobResult> {
      return withinBounds(
        repositoryBlobResultSchema.parse(await provider.blob({ ...request, limits: checked })),
        checked,
      );
    },
    async comparison(
      request: Omit<RepositoryReadRequest, "limits"> & {
        base: RepositoryRevision;
        head: RepositoryRevision;
      },
    ): Promise<RepositoryComparisonResult> {
      return withinBounds(
        repositoryComparisonResultSchema.parse(
          await provider.comparison({ ...request, limits: checked }),
        ),
        checked,
      );
    },
  };
}
