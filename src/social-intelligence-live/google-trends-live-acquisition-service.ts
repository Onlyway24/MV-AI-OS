import { RepositoryConflictError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import type { RestrictedHttpsClient } from "../research/restricted-https-client.js";
import { googleTrendsBatchRecords, parseGoogleTrendsRss } from "./google-trends-rss-adapter.js";
import type { SocialLiveImportBatchReceipt } from "./social-intelligence-live.js";
import type { SocialIntelligenceLiveService } from "./social-intelligence-live-service.js";

export interface GoogleTrendsLiveAcquisitionReceipt {
  readonly acquiredAt: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly finalUrl: string;
  readonly importReceipt: SocialLiveImportBatchReceipt;
  readonly itemCount: number;
  readonly sourceId: "social-google-trends-it";
  readonly territory: "IT";
  readonly unauthorizedExternalEffectOccurred: false;
}

export class GoogleTrendsLiveAcquisitionService {
  public constructor(private readonly dependencies: { readonly actorId: string; readonly clock: Clock; readonly https: RestrictedHttpsClient; readonly live: SocialIntelligenceLiveService; readonly repositories: RepositoryTransactionRunner; readonly workspaceId: string }) {}

  public async acquire(): Promise<GoogleTrendsLiveAcquisitionReceipt> {
    const source = await this.dependencies.repositories.transaction(({ operationalPlanes }) => operationalPlanes.getSourceById("social-google-trends-it"));
    if (source?.actorId !== this.dependencies.actorId || source.workspaceId !== this.dependencies.workspaceId || source.status !== "AUTHORIZED") throw new RepositoryConflictError("Google Trends Social source is not authorized for this operator");
    const acquisition = await this.dependencies.https.acquire({ maxBytes: 1_048_576, maxRedirects: 1, source, timeoutMs: 15_000, url: "https://trends.google.com/trending/rss?geo=IT" });
    if (acquisition.contentType !== "text/xml") throw new RepositoryConflictError("Google Trends RSS returned an unexpected content type");
    const acquiredAt = this.#now();
    const parsed = parseGoogleTrendsRss({ acquiredAt, byteLength: acquisition.byteLength, finalUrl: acquisition.finalUrl, service: this.dependencies.live, sourceId: source.sourceId, territory: "IT", xml: acquisition.body });
    const importReceipt = await this.dependencies.live.importBatch({ batchId: `google-trends-it-${parsed.contentHash.slice(0, 24)}`, records: googleTrendsBatchRecords(parsed) });
    if (!["COMMITTED", "REPLAYED"].includes(importReceipt.status)) throw new RepositoryConflictError("Google Trends RSS import did not commit atomically", { blockers: importReceipt.blockers });
    return Object.freeze({ acquiredAt, byteLength: acquisition.byteLength, contentHash: parsed.contentHash, finalUrl: acquisition.finalUrl, importReceipt, itemCount: parsed.items.length, sourceId: "social-google-trends-it" as const, territory: "IT" as const, unauthorizedExternalEffectOccurred: false as const });
  }

  #now(): string { const value = this.dependencies.clock.now(); if (Number.isNaN(value.getTime())) throw new RepositoryConflictError("Google Trends acquisition clock is invalid"); return value.toISOString(); }
}
