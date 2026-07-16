import type { SourceRegistrationRequest } from "../operational-planes/operational-plane.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import { RepositoryConflictError } from "../errors/core-error.js";
import type { OperationalPlaneService } from "../operational-planes/operational-plane-service.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";

export const INITIAL_SOCIAL_SOURCE_BLUEPRINTS: readonly SourceRegistrationRequest[] = Object.freeze([
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
    canonicalReference: "https://ads.tiktok.com/business/creativecenter/",
    category: "AUTHORIZED_DATASET",
    maxFreshnessDays: 1,
    name: "TikTok Creative Center — Trends",
    permittedRiskDomains: ["GENERAL"] as const,
    publicCitationAllowed: true,
    reliability: "MEDIUM",
    requiresSecondSource: true,
    sourceId: "social-tiktok-creative-center",
    status: "AUTHORIZED",
  }),
  Object.freeze({
    canonicalReference: "https://www.facebook.com/help/684550305010470/",
    category: "OFFICIAL_DOCUMENTATION",
    maxFreshnessDays: 30,
    name: "Instagram Insights — export account autorizzato",
    permittedRiskDomains: ["GENERAL"] as const,
    publicCitationAllowed: false,
    reliability: "HIGH",
    requiresSecondSource: false,
    sourceId: "social-instagram-insights-export",
    status: "AUTHORIZED",
  }),
  Object.freeze({
    canonicalReference: "https://ads.tiktok.com/help/article/how-to-use-the-commercial-music-library",
    category: "OFFICIAL_DOCUMENTATION",
    maxFreshnessDays: 1,
    name: "TikTok Commercial Music Library",
    permittedRiskDomains: ["GENERAL", "LEGAL"] as const,
    publicCitationAllowed: true,
    reliability: "HIGH",
    requiresSecondSource: false,
    sourceId: "social-tiktok-commercial-music-library",
    status: "AUTHORIZED",
  }),
]);

export const SOCIAL_PUBLIC_OBSERVATION_SOURCE_BLUEPRINTS: readonly SourceRegistrationRequest[] = Object.freeze([
  Object.freeze({
    canonicalReference: "https://www.instagram.com/",
    category: "AUTHORIZED_DATASET",
    maxFreshnessDays: 7,
    name: "Instagram — osservazione pubblica competitor autorizzati",
    permittedRiskDomains: ["GENERAL"] as const,
    publicCitationAllowed: true,
    reliability: "MEDIUM",
    requiresSecondSource: true,
    sourceId: "social-instagram-public-competitors",
    status: "AUTHORIZED",
  }),
]);

export const SOCIAL_SOURCE_POLICY_NOTES = Object.freeze({
  "social-google-trends-it": "Indicatore relativo, normalizzato e campionato: non dimostra da solo volume assoluto o intenzione di acquisto.",
  "social-instagram-insights-export": "Accetta soltanto dati dell'account di Fabio esportati o trascritti con attribuzione verificabile.",
  "social-tiktok-commercial-music-library": "Autorizzazione valida soltanto per regione, account compatibility, placement e finestra osservata.",
  "social-tiktok-creative-center": "Segnale di attenzione: richiede corroborazione prima di sostenere claim di domanda commerciale.",
} as const);

export async function ensureInitialSocialSources(input: { readonly operationalPlanes: OperationalPlaneService; readonly repositories: RepositoryTransactionRunner; readonly workspaceId: string }): Promise<readonly SourceRegistryEntry[]> {
  const registered: SourceRegistryEntry[] = [];
  for (const blueprint of [...INITIAL_SOCIAL_SOURCE_BLUEPRINTS, ...SOCIAL_PUBLIC_OBSERVATION_SOURCE_BLUEPRINTS]) {
    const existing = await input.repositories.transaction(({ operationalPlanes }) => operationalPlanes.getSourceById(blueprint.sourceId));
    if (existing === undefined) { registered.push(await input.operationalPlanes.registerSource(blueprint)); continue; }
    if (existing.workspaceId !== input.workspaceId || !sameBlueprint(existing, blueprint)) throw new RepositoryConflictError("Official Social source conflicts with the existing Source Registry");
    registered.push(existing);
  }
  return Object.freeze(registered);
}

function sameBlueprint(entry: SourceRegistryEntry, blueprint: SourceRegistrationRequest): boolean {
  return entry.canonicalReference === blueprint.canonicalReference && entry.category === blueprint.category && entry.maxFreshnessDays === blueprint.maxFreshnessDays && entry.name === blueprint.name && JSON.stringify(entry.permittedRiskDomains) === JSON.stringify(blueprint.permittedRiskDomains) && entry.publicCitationAllowed === blueprint.publicCitationAllowed && entry.reliability === blueprint.reliability && entry.requiresSecondSource === blueprint.requiresSecondSource && entry.sourceId === blueprint.sourceId && entry.status === blueprint.status;
}
