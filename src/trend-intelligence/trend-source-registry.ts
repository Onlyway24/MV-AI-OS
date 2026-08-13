import { RepositoryConflictError } from "../errors/core-error.js";
import type {
  SourceRegistrationRequest,
  SourceRegistryEntry,
} from "../operational-planes/operational-plane.js";
import type { OperationalPlaneService } from "../operational-planes/operational-plane-service.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";

/**
 * The bounded, no-credential first wave. Registration records a local policy; it
 * never claims that a connector ran or that provider data exists.
 */
export const PUBLIC_TREND_SOURCE_BLUEPRINTS: readonly SourceRegistrationRequest[] =
  Object.freeze([
    Object.freeze({
      canonicalReference: "https://trends.google.com/trending/",
      category: "AUTHORIZED_DATASET",
      maxFreshnessDays: 1,
      name: "Google Trends — Trending Now export",
      permittedRiskDomains: ["GENERAL"] as const,
      publicCitationAllowed: true,
      reliability: "MEDIUM",
      requiresSecondSource: true,
      sourceId: "social-google-trends-it",
      status: "AUTHORIZED",
    }),
    Object.freeze({
      canonicalReference: "https://api.gdeltproject.org/api/v2/doc/",
      category: "AUTHORIZED_DATASET",
      maxFreshnessDays: 1,
      name: "GDELT Project — DOC 2.0 API",
      permittedRiskDomains: ["GENERAL"] as const,
      publicCitationAllowed: true,
      reliability: "MEDIUM",
      requiresSecondSource: true,
      sourceId: "trend-gdelt",
      status: "AUTHORIZED",
    }),
    Object.freeze({
      canonicalReference: "https://wikimedia.org/api/rest_v1/metrics/pageviews/",
      category: "AUTHORIZED_DATASET",
      maxFreshnessDays: 1,
      name: "Wikimedia Analytics — Pageviews",
      permittedRiskDomains: ["GENERAL"] as const,
      publicCitationAllowed: true,
      reliability: "MEDIUM",
      requiresSecondSource: true,
      sourceId: "trend-wikimedia",
      status: "AUTHORIZED",
    }),
    Object.freeze({
      canonicalReference: "https://export.arxiv.org/api/",
      category: "AUTHORIZED_DATASET",
      maxFreshnessDays: 7,
      name: "arXiv — public metadata API",
      permittedRiskDomains: ["GENERAL"] as const,
      publicCitationAllowed: true,
      reliability: "MEDIUM",
      requiresSecondSource: true,
      sourceId: "trend-arxiv",
      status: "AUTHORIZED",
    }),
    Object.freeze({
      canonicalReference: "https://api.github.com/",
      category: "AUTHORIZED_DATASET",
      maxFreshnessDays: 1,
      name: "GitHub — public metadata API",
      permittedRiskDomains: ["GENERAL"] as const,
      publicCitationAllowed: true,
      reliability: "MEDIUM",
      requiresSecondSource: true,
      sourceId: "trend-github",
      status: "AUTHORIZED",
    }),
  ]);

export async function ensurePublicTrendSources(input: {
  readonly operationalPlanes: OperationalPlaneService;
  readonly repositories: RepositoryTransactionRunner;
  readonly workspaceId: string;
}): Promise<readonly SourceRegistryEntry[]> {
  const registered: SourceRegistryEntry[] = [];
  for (const blueprint of PUBLIC_TREND_SOURCE_BLUEPRINTS) {
    const existing = await input.repositories.transaction(({ operationalPlanes }) =>
      operationalPlanes.getSourceById(blueprint.sourceId)
    );
    if (existing === undefined) {
      registered.push(await input.operationalPlanes.registerSource(blueprint));
      continue;
    }
    if (
      existing.workspaceId !== input.workspaceId ||
      !sameBlueprint(existing, blueprint)
    ) {
      throw new RepositoryConflictError(
        "Public Trend source conflicts with the existing Source Registry",
      );
    }
    registered.push(existing);
  }
  return Object.freeze(registered);
}

function sameBlueprint(
  entry: SourceRegistryEntry,
  blueprint: SourceRegistrationRequest,
): boolean {
  return entry.canonicalReference === blueprint.canonicalReference &&
    entry.category === blueprint.category &&
    entry.maxFreshnessDays === blueprint.maxFreshnessDays &&
    entry.name === blueprint.name &&
    JSON.stringify(entry.permittedRiskDomains) ===
      JSON.stringify(blueprint.permittedRiskDomains) &&
    entry.publicCitationAllowed === blueprint.publicCitationAllowed &&
    entry.reliability === blueprint.reliability &&
    entry.requiresSecondSource === blueprint.requiresSecondSource &&
    entry.sourceId === blueprint.sourceId &&
    entry.status === blueprint.status;
}
