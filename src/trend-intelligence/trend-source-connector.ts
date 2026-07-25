import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import {
  MAX_TREND_ITEMS_PER_REQUEST,
  MAX_TREND_RECEIPTS,
  TREND_INTELLIGENCE_CONTRACT_VERSION,
  deepFreezeTrend,
  frozenTrendClone,
  type TrendAcquisitionRequest,
  type TrendConnectorReasonCode,
  type TrendConnectorReceipt,
  type TrendConnectorResult,
  type TrendSignal,
  type TrendSourceConnectionProfile,
  type TrendSourceTransport,
  type TrendTransportItem,
  type TrendTransportResponse,
} from "./trend-intelligence-contract.js";
import { preflightTrendSource } from "./trend-source-preflight.js";
import { trendSourceByKey } from "./trend-source-catalog.js";

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const TRANSPORT_IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/u;

export class TrendConnectorError extends Error {
  public constructor(public readonly code: "PROFILE_INVALID" | "RECEIPT_LIMIT_REACHED" | "REQUEST_INVALID" | "RECONCILIATION_INVALID" | "TRANSPORT_INVALID", message: string) {
    super(message);
    this.name = "TrendConnectorError";
  }
}

export class TrendTransportTimeoutError extends Error {
  public constructor(public readonly operationId?: string) {
    super("Trend source transport timed out");
    this.name = "TrendTransportTimeoutError";
  }
}

export class TrendTransportFailureError extends Error {
  public constructor() {
    super("Trend source transport proved that no provider dispatch occurred");
    this.name = "TrendTransportFailureError";
  }
}

interface StoredOperation {
  readonly request: TrendAcquisitionRequest;
  readonly requestFingerprint: string;
  readonly result: TrendConnectorResult;
}

interface ReceiptInput {
  readonly clientRequestId: string;
  readonly cost: TrendConnectorReceipt["cost"];
  readonly itemCount: number;
  readonly operationId: string;
  readonly providerOperationId?: string;
  readonly providerRequestId?: string;
  readonly reasonCode: TrendConnectorReasonCode;
  readonly reconcilesReceiptId?: string;
  readonly replayOfReceiptId?: string;
  readonly requestFingerprint: string;
  readonly signalFingerprints: readonly string[];
  readonly stage: TrendConnectorReceipt["diagnostic"]["stage"];
  readonly status: TrendConnectorReceipt["status"];
  readonly statusCode?: number;
}

/**
 * Pure provider-neutral read connector. It can only execute zero-cost,
 * read-only requests after an explicit Source Registry/access preflight.
 * Receipts are redacted, deeply frozen and append-only for this connector
 * instance; durable persistence is intentionally outside this module.
 */
export class TrendSourceConnector {
  readonly #byIdempotency = new Map<string, StoredOperation>();
  readonly #profile: TrendSourceConnectionProfile;
  readonly #requestByReceiptId = new Map<string, TrendAcquisitionRequest>();
  readonly #receiptSignals = new Map<string, readonly TrendSignal[]>();
  readonly #receipts: TrendConnectorReceipt[] = [];
  readonly #transport: TrendSourceTransport;
  readonly #now: () => Date;
  #operationTail: Promise<void> = Promise.resolve();

  public constructor(input: {
    readonly now?: () => Date;
    readonly profile: TrendSourceConnectionProfile;
    readonly transport: TrendSourceTransport;
  }) {
    if (!IDENTIFIER.test(input.profile.actorId) || !IDENTIFIER.test(input.profile.workspaceId)) {
      throw new TrendConnectorError("PROFILE_INVALID", "Trend connector profile identity is invalid");
    }
    if (!TRANSPORT_IDENTIFIER.test(input.transport.transportId)) {
      throw new TrendConnectorError("TRANSPORT_INVALID", "Trend source transport ID is invalid");
    }
    this.#profile = frozenTrendClone(input.profile);
    this.#transport = input.transport;
    this.#now = input.now ?? (() => new Date());
  }

  public acquire(requestCandidate: TrendAcquisitionRequest): Promise<TrendConnectorResult> {
    return this.#exclusive(() => this.#acquire(requestCandidate));
  }

  async #acquire(requestCandidate: TrendAcquisitionRequest): Promise<TrendConnectorResult> {
    const request = checkedRequest(requestCandidate, this.#profile.sourceKey);
    const requestFingerprint = canonicalSha256(request);
    const idempotencyFingerprint = canonicalSha256(request.idempotencyKey);
    const previous = this.#byIdempotency.get(idempotencyFingerprint);
    const operationId = localOperationId(requestFingerprint, this.#receipts.length + 1);

    if (previous !== undefined) {
      if (previous.requestFingerprint !== requestFingerprint) {
        const receipt = this.#appendReceipt(request, {
          clientRequestId: request.clientRequestId,
          cost: noPaidCall(),
          itemCount: 0,
          operationId,
          reasonCode: "IDEMPOTENCY_CONFLICT",
          requestFingerprint,
          signalFingerprints: [],
          stage: "IDEMPOTENCY",
          status: "BLOCKED",
        });
        return result(receipt, []);
      }
      if (previous.result.receipt.status !== "COMPLETED" && previous.result.receipt.status !== "RECONCILED") {
        return previous.result;
      }
      const receipt = this.#appendReceipt(request, {
        clientRequestId: request.clientRequestId,
        cost: noPaidCall(),
        itemCount: previous.result.signals.length,
        operationId,
        reasonCode: "IDEMPOTENT_REPLAY",
        replayOfReceiptId: previous.result.receipt.receiptId,
        requestFingerprint,
        signalFingerprints: previous.result.signals.map(({ signalFingerprint }) => signalFingerprint),
        stage: "IDEMPOTENCY",
        status: "REPLAYED",
      });
      return result(receipt, previous.result.signals);
    }

    const preflight = preflightTrendSource(this.#profile);
    if (!preflight.executionEligible) {
      const receipt = this.#appendReceipt(request, {
        clientRequestId: request.clientRequestId,
        cost: noPaidCall(),
        itemCount: 0,
        operationId,
        reasonCode: "PREFLIGHT_BLOCKED",
        requestFingerprint,
        signalFingerprints: [],
        stage: "PREFLIGHT",
        status: "BLOCKED",
      });
      const blocked = result(receipt, []);
      this.#byIdempotency.set(idempotencyFingerprint, { request, requestFingerprint, result: blocked });
      return blocked;
    }

    this.#assertReceiptWritable();
    let response: TrendTransportResponse;
    try {
      response = await withLocalTimeout(this.#transport.acquire({
        clientRequestId: request.clientRequestId,
        contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
        idempotencyKeyFingerprint: idempotencyFingerprint,
        maxItems: request.maxItems,
        queryFingerprint: request.queryFingerprint,
        retryCount: 0,
        sourceKey: request.sourceKey,
        timeoutMs: request.timeoutMs,
      }), request.timeoutMs);
    } catch (error) {
      const definitiveFailure = error instanceof TrendTransportFailureError;
      const providerOperationId = error instanceof TrendTransportTimeoutError
        ? safeIdentifier(error.operationId)
        : undefined;
      const receipt = this.#appendReceipt(request, {
        clientRequestId: request.clientRequestId,
        cost: definitiveFailure ? noPaidCall() : reconciliationPending(),
        itemCount: 0,
        operationId,
        ...(providerOperationId === undefined ? {} : { providerOperationId }),
        reasonCode: definitiveFailure ? "TRANSPORT_FAILED" : "RECONCILIATION_PENDING",
        requestFingerprint,
        signalFingerprints: [],
        stage: "TRANSPORT",
        status: definitiveFailure ? "FAILED" : "UNCERTAIN",
      });
      const failed = result(receipt, []);
      this.#byIdempotency.set(idempotencyFingerprint, { request, requestFingerprint, result: failed });
      return failed;
    }
    const acquired = this.#fromResponse({ operationId, request, requestFingerprint, response });
    this.#byIdempotency.set(idempotencyFingerprint, { request, requestFingerprint, result: acquired });
    return acquired;
  }

  public reconcile(receiptId: string): Promise<TrendConnectorResult> {
    return this.#exclusive(() => this.#reconcile(receiptId));
  }

  async #reconcile(receiptId: string): Promise<TrendConnectorResult> {
    if (!IDENTIFIER.test(receiptId)) throw new TrendConnectorError("RECONCILIATION_INVALID", "Trend reconciliation receipt ID is invalid");
    const original = this.#receipts.find((receipt) => receipt.receiptId === receiptId);
    if (original?.status !== "UNCERTAIN") throw new TrendConnectorError("RECONCILIATION_INVALID", "Trend receipt is not reconciliation-pending");
    if (original.reconcilesReceiptId !== undefined) {
      return result(original, this.#receiptSignals.get(original.receiptId) ?? []);
    }
    const existing = this.#receipts.find((receipt) =>
      receipt.reconcilesReceiptId === receiptId &&
      ["BLOCKED", "FAILED", "RECONCILED", "UNCERTAIN"].includes(receipt.status)
    );
    if (existing !== undefined) {
      const signals = this.#receiptSignals.get(existing.receiptId) ?? [];
      if (existing.status !== "RECONCILED") return result(existing, signals);
      const replay = this.#appendReceipt(this.#requestFor(original), {
        clientRequestId: original.clientRequestId,
        cost: existing.cost,
        itemCount: signals.length,
        operationId: localOperationId(original.requestFingerprint, this.#receipts.length + 1),
        reasonCode: "IDEMPOTENT_REPLAY",
        replayOfReceiptId: existing.receiptId,
        requestFingerprint: original.requestFingerprint,
        signalFingerprints: signals.map(({ signalFingerprint }) => signalFingerprint),
        stage: "IDEMPOTENCY",
        status: "REPLAYED",
      });
      return result(replay, signals);
    }
    const request = this.#requestFor(original);
    if (original.providerOperationId === undefined) {
      return result(original, this.#receiptSignals.get(original.receiptId) ?? []);
    }

    const operationId = localOperationId(original.requestFingerprint, this.#receipts.length + 1);
    this.#assertReceiptWritable();
    let response: TrendTransportResponse;
    try {
      response = await withLocalTimeout(this.#transport.reconcile({
        clientRequestId: original.clientRequestId,
        contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
        operationId: original.providerOperationId,
        sourceKey: original.sourceKey,
        timeoutMs: request.timeoutMs,
      }), request.timeoutMs);
    } catch (error) {
      const providerOperationId = error instanceof TrendTransportTimeoutError
        ? safeIdentifier(error.operationId) ?? original.providerOperationId
        : original.providerOperationId;
      const receipt = this.#appendReceipt(request, {
        clientRequestId: original.clientRequestId,
        cost: reconciliationPending(),
        itemCount: 0,
        operationId,
        providerOperationId,
        reasonCode: "RECONCILIATION_PENDING",
        reconcilesReceiptId: original.receiptId,
        requestFingerprint: original.requestFingerprint,
        signalFingerprints: [],
        stage: "RECONCILIATION",
        status: "UNCERTAIN",
      });
      const failed = result(receipt, []);
      this.#byIdempotency.set(original.idempotencyKeyFingerprint, {
        request,
        requestFingerprint: original.requestFingerprint,
        result: failed,
      });
      return failed;
    }
    const reconciled = this.#fromResponse({ operationId, reconcilesReceiptId: original.receiptId, request, requestFingerprint: original.requestFingerprint, response });
    this.#byIdempotency.set(original.idempotencyKeyFingerprint, {
      request,
      requestFingerprint: original.requestFingerprint,
      result: reconciled,
    });
    return reconciled;
  }

  public receipts(): readonly TrendConnectorReceipt[] {
    return Object.freeze([...this.#receipts]);
  }

  #fromResponse(input: {
    readonly operationId: string;
    readonly reconcilesReceiptId?: string;
    readonly request: TrendAcquisitionRequest;
    readonly requestFingerprint: string;
    readonly response: TrendTransportResponse;
  }): TrendConnectorResult {
    const response = input.response;
    const providerOperationId = safeIdentifier(response.operationId);
    const providerRequestId = safeIdentifier(response.providerRequestId);
    const references = {
      ...(providerOperationId === undefined ? {} : { providerOperationId }),
      ...(providerRequestId === undefined ? {} : { providerRequestId }),
      ...(input.reconcilesReceiptId === undefined ? {} : { reconcilesReceiptId: input.reconcilesReceiptId }),
    };
    if (!Number.isSafeInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599) {
      return this.#terminal(input.request, {
        ...references,
        operationId: input.operationId,
        reasonCode: "INVALID_PROVIDER_RESPONSE",
        requestFingerprint: input.requestFingerprint,
        stage: input.reconcilesReceiptId === undefined ? "VALIDATION" : "RECONCILIATION",
        status: "FAILED",
      });
    }
    if (response.statusCode === 200) {
      let signals: readonly TrendSignal[];
      try {
        signals = normalizeSignals(response.body, input.request, this.#profile);
      } catch {
        return this.#terminal(input.request, {
          ...references,
          operationId: input.operationId,
          reasonCode: "INVALID_PROVIDER_RESPONSE",
          requestFingerprint: input.requestFingerprint,
          stage: input.reconcilesReceiptId === undefined ? "VALIDATION" : "RECONCILIATION",
          status: "FAILED",
          statusCode: 200,
        });
      }
      const receipt = this.#appendReceipt(input.request, {
        clientRequestId: input.request.clientRequestId,
        cost: noPaidCall(),
        itemCount: signals.length,
        operationId: input.operationId,
        ...references,
        reasonCode: input.reconcilesReceiptId === undefined ? "REQUEST_COMPLETED" : "RECONCILIATION_COMPLETED",
        requestFingerprint: input.requestFingerprint,
        signalFingerprints: signals.map(({ signalFingerprint }) => signalFingerprint),
        stage: input.reconcilesReceiptId === undefined ? "VALIDATION" : "RECONCILIATION",
        status: input.reconcilesReceiptId === undefined ? "COMPLETED" : "RECONCILED",
        statusCode: 200,
      });
      this.#receiptSignals.set(receipt.receiptId, signals);
      return result(receipt, signals);
    }
    const transportStage = input.reconcilesReceiptId === undefined ? "TRANSPORT" as const : "RECONCILIATION" as const;
    if (response.statusCode === 401) return this.#terminal(input.request, { ...references, operationId: input.operationId, reasonCode: "AUTHENTICATION_REQUIRED", requestFingerprint: input.requestFingerprint, stage: transportStage, status: "BLOCKED", statusCode: 401 });
    if (response.statusCode === 403) return this.#terminal(input.request, { ...references, operationId: input.operationId, reasonCode: "AUTHORIZATION_REQUIRED", requestFingerprint: input.requestFingerprint, stage: transportStage, status: "BLOCKED", statusCode: 403 });
    if (response.statusCode === 429) return this.#terminal(input.request, { ...references, operationId: input.operationId, reasonCode: "PROVIDER_RATE_LIMITED", requestFingerprint: input.requestFingerprint, stage: transportStage, status: "FAILED", statusCode: 429 });
    if (response.statusCode >= 500) return this.#terminal(input.request, { ...references, operationId: input.operationId, reasonCode: "PROVIDER_UNAVAILABLE", requestFingerprint: input.requestFingerprint, stage: transportStage, status: "FAILED", statusCode: response.statusCode });
    return this.#terminal(input.request, { ...references, operationId: input.operationId, reasonCode: "PROVIDER_INVALID_REQUEST", requestFingerprint: input.requestFingerprint, stage: transportStage, status: "FAILED", statusCode: response.statusCode });
  }

  #terminal(
    request: TrendAcquisitionRequest,
    input: Omit<ReceiptInput, "clientRequestId" | "cost" | "itemCount" | "signalFingerprints">,
  ): TrendConnectorResult {
    const receipt = this.#appendReceipt(request, { ...input, clientRequestId: request.clientRequestId, cost: noPaidCall(), itemCount: 0, signalFingerprints: [] });
    this.#receiptSignals.set(receipt.receiptId, Object.freeze([]));
    return result(receipt, []);
  }

  #appendReceipt(request: TrendAcquisitionRequest, input: ReceiptInput): TrendConnectorReceipt {
    if (this.#receipts.length >= MAX_TREND_RECEIPTS) throw new TrendConnectorError("RECEIPT_LIMIT_REACHED", "Trend receipt limit reached");
    const sequence = this.#receipts.length + 1;
    const recordedAt = validNow(this.#now);
    const receiptId = `trend-receipt-${canonicalSha256({ operationId: input.operationId, sequence, status: input.status }).slice(0, 32)}`;
    const receipt = deepFreezeTrend({
      actorId: this.#profile.actorId,
      clientRequestId: input.clientRequestId,
      contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
      cost: input.cost,
      diagnostic: {
        reasonCode: input.reasonCode,
        stage: input.stage,
        ...(input.statusCode === undefined ? {} : { statusCode: input.statusCode }),
      },
      externalEffectOccurred: false,
      externalWrites: "LOCKED",
      idempotencyKeyFingerprint: canonicalSha256(request.idempotencyKey),
      itemCount: input.itemCount,
      operationId: input.operationId,
      ...(input.providerOperationId === undefined ? {} : { providerOperationId: input.providerOperationId }),
      ...(input.providerRequestId === undefined ? {} : { providerRequestId: input.providerRequestId }),
      publication: "LOCKED",
      rawPayloadStored: false,
      receiptId,
      ...(input.reconcilesReceiptId === undefined ? {} : { reconcilesReceiptId: input.reconcilesReceiptId }),
      recordedAt,
      ...(input.replayOfReceiptId === undefined ? {} : { replayOfReceiptId: input.replayOfReceiptId }),
      requestFingerprint: input.requestFingerprint,
      retryCount: 0,
      secretMaterialStored: false,
      sequence,
      signalFingerprints: Object.freeze([...input.signalFingerprints]),
      sourceId: trendSourceByKey(request.sourceKey).sourceId,
      sourceKey: request.sourceKey,
      status: input.status,
      transportId: this.#transport.transportId,
      workspaceId: this.#profile.workspaceId,
    } satisfies TrendConnectorReceipt);
    this.#receipts.push(receipt);
    this.#requestByReceiptId.set(receipt.receiptId, request);
    return receipt;
  }

  #requestFor(receipt: TrendConnectorReceipt): TrendAcquisitionRequest {
    const request = this.#requestByReceiptId.get(receipt.receiptId);
    if (request === undefined) throw new TrendConnectorError("RECONCILIATION_INVALID", "Trend reconciliation request binding is unavailable");
    return request;
  }

  #assertReceiptWritable(): void {
    if (this.#receipts.length >= MAX_TREND_RECEIPTS) {
      throw new TrendConnectorError("RECEIPT_LIMIT_REACHED", "Trend receipt limit reached");
    }
    validNow(this.#now);
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const running = this.#operationTail.then(operation);
    this.#operationTail = running.then(
      () => undefined,
      () => undefined,
    );
    return running;
  }
}

function checkedRequest(candidate: TrendAcquisitionRequest, sourceKey: TrendSourceConnectionProfile["sourceKey"]): TrendAcquisitionRequest {
  const keys = Object.keys(candidate).sort();
  const expected = ["clientRequestId", "contractVersion", "idempotencyKey", "maxCostUsd", "maxItems", "queryFingerprint", "retryCount", "sourceKey", "timeoutMs"].sort();
  const runtime = candidate as {
    readonly contractVersion: string;
    readonly maxCostUsd: number;
    readonly retryCount: number;
  };
  if (
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index]) ||
    runtime.contractVersion !== TREND_INTELLIGENCE_CONTRACT_VERSION ||
    runtime.maxCostUsd !== 0 ||
    runtime.retryCount !== 0 ||
    candidate.sourceKey !== sourceKey ||
    !IDENTIFIER.test(candidate.clientRequestId) ||
    !IDENTIFIER.test(candidate.idempotencyKey) ||
    !HASH.test(candidate.queryFingerprint) ||
    !Number.isSafeInteger(candidate.maxItems) ||
    candidate.maxItems < 1 ||
    candidate.maxItems > MAX_TREND_ITEMS_PER_REQUEST ||
    !Number.isSafeInteger(candidate.timeoutMs) ||
    candidate.timeoutMs < 100 ||
    candidate.timeoutMs > 60_000
  ) {
    throw new TrendConnectorError("REQUEST_INVALID", "Trend acquisition request is invalid");
  }
  return frozenTrendClone(candidate);
}

function normalizeSignals(body: unknown, request: TrendAcquisitionRequest, profile: TrendSourceConnectionProfile): readonly TrendSignal[] {
  if (!record(body) || Object.keys(body).length !== 1 || !Array.isArray(body.items) || body.items.length > request.maxItems) throw new Error("invalid");
  const items = body.items as unknown[];
  const externalIds = new Set<string>();
  const fingerprints = new Set<string>();
  const sourceId = profile.sourceRegistryEntry?.sourceId;
  const registryReference = profile.sourceRegistryEntry?.canonicalReference;
  if (sourceId === undefined || registryReference === undefined) throw new Error("invalid");
  const catalogSource = trendSourceByKey(request.sourceKey);
  const signals = items.map((candidate, index): TrendSignal => {
    const item = checkedItem(candidate, catalogSource, registryReference);
    if (externalIds.has(item.externalId)) throw new Error("duplicate");
    externalIds.add(item.externalId);
    const payload = {
      attributionRequired: item.attributionRequired,
      ...(item.evidenceReference === undefined ? {} : { evidenceReference: item.evidenceReference }),
      evidenceKind: item.evidenceKind,
      externalId: item.externalId,
      ...(item.metric === undefined ? {} : { metric: item.metric }),
      observedAt: item.observedAt,
      providerReference: item.providerReference,
      ...(item.providerUpdatedAt === undefined ? {} : { providerUpdatedAt: item.providerUpdatedAt }),
      ...(item.publishedAt === undefined ? {} : { publishedAt: item.publishedAt }),
      ...(item.retentionExpiresAt === undefined ? {} : { retentionExpiresAt: item.retentionExpiresAt }),
      rightsClass: item.rightsClass,
      signalFamily: item.signalFamily,
      sourceId,
      sourceKey: request.sourceKey,
      summary: item.summary,
      tags: item.tags,
      territory: item.territory,
      topic: item.topic,
    };
    const signalFingerprint = canonicalSha256(payload);
    if (fingerprints.has(signalFingerprint)) throw new Error("duplicate");
    fingerprints.add(signalFingerprint);
    return deepFreezeTrend({
      ...payload,
      signalFingerprint,
      signalId: `trend-signal-${signalFingerprint.slice(0, 32)}-${String(index + 1)}`,
    });
  });
  return Object.freeze(signals);
}

function checkedItem(value: unknown, source: ReturnType<typeof trendSourceByKey>, registryReference: string): TrendTransportItem {
  if (!record(value)) throw new Error("invalid");
  const expected = [
    "attributionRequired",
    ...(value.evidenceReference === undefined ? [] : ["evidenceReference"]),
    "evidenceKind",
    "externalId",
    ...(value.metric === undefined ? [] : ["metric"]),
    "observedAt",
    "providerReference",
    ...(value.providerUpdatedAt === undefined ? [] : ["providerUpdatedAt"]),
    ...(value.publishedAt === undefined ? [] : ["publishedAt"]),
    ...(value.retentionExpiresAt === undefined ? [] : ["retentionExpiresAt"]),
    "rightsClass",
    "signalFamily",
    "summary",
    "tags",
    "territory",
    "topic",
  ].sort();
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index]) ||
    typeof value.attributionRequired !== "boolean" ||
    (value.evidenceReference !== undefined && !safePersistedHttpsUrl(value.evidenceReference)) ||
    !["METRIC", "PUBLICATION", "RANKING", "SEARCH_TERM"].includes(String(value.evidenceKind)) ||
    !boundedText(value.externalId, 1, 256) ||
    (value.metric !== undefined && !metric(value.metric)) ||
    !timestamp(value.observedAt) ||
    !providerReferenceWithinBoundary(value.providerReference, source.canonicalReference) ||
    !providerReferenceWithinBoundary(value.providerReference, registryReference) ||
    (value.providerUpdatedAt !== undefined && !timestamp(value.providerUpdatedAt)) ||
    (value.publishedAt !== undefined && !timestamp(value.publishedAt)) ||
    (value.retentionExpiresAt !== undefined && (!timestamp(value.retentionExpiresAt) || Date.parse(value.retentionExpiresAt) <= Date.parse(value.observedAt))) ||
    !["AGGREGATE", "LICENSED", "LINK_ONLY", "METADATA_ONLY"].includes(String(value.rightsClass)) ||
    !source.signalFamilies.includes(value.signalFamily as never) ||
    !boundedText(value.summary, 1, 2_000) ||
    !boundedStrings(value.tags, 0, 20, 100) ||
    !boundedText(value.territory, 1, 100) ||
    !boundedText(value.topic, 1, 300)
  ) throw new Error("invalid");
  return frozenTrendClone(value) as unknown as TrendTransportItem;
}

function result(receipt: TrendConnectorReceipt, signals: readonly TrendSignal[]): TrendConnectorResult {
  return deepFreezeTrend({ receipt, signals: Object.freeze([...signals]) });
}

function localOperationId(requestFingerprint: string, sequence: number): string {
  return `trend-operation-${canonicalSha256({ requestFingerprint, sequence }).slice(0, 32)}`;
}

function noPaidCall(): TrendConnectorReceipt["cost"] {
  return Object.freeze({ amountUsd: 0, classification: "NO_PAID_CALL" });
}

function reconciliationPending(): TrendConnectorReceipt["cost"] {
  return Object.freeze({ classification: "RECONCILIATION_PENDING" });
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : undefined;
}

function withLocalTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TrendTransportTimeoutError());
    }, timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

function validNow(now: () => Date): string {
  const value = now();
  if (Number.isNaN(value.getTime())) throw new TrendConnectorError("REQUEST_INVALID", "Trend connector clock is invalid");
  return value.toISOString();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function boundedStrings(value: unknown, minimum: number, maximum: number, maxLength: number): value is readonly string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((item) => boundedText(item, 1, maxLength)) && new Set(value).size === value.length;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function safePersistedHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}

function providerReferenceWithinBoundary(value: unknown, canonicalReference: string): value is string {
  if (!safePersistedHttpsUrl(value)) return false;
  try {
    const candidate = new URL(value);
    const canonical = new URL(canonicalReference);
    const path = canonical.pathname.endsWith("/") ? canonical.pathname : `${canonical.pathname}/`;
    return candidate.protocol === canonical.protocol &&
      candidate.hostname === canonical.hostname &&
      candidate.port === canonical.port &&
      (candidate.pathname === canonical.pathname || candidate.pathname.startsWith(path));
  } catch {
    return false;
  }
}

function metric(value: unknown): boolean {
  if (!record(value)) return false;
  const expected = ["name", ...(value.normalization === undefined ? [] : ["normalization"]), "unit", "value", "window"].sort();
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    boundedText(value.name, 1, 100) &&
    (value.normalization === undefined || boundedText(value.normalization, 1, 200)) &&
    boundedText(value.unit, 1, 50) &&
    typeof value.value === "number" &&
    Number.isFinite(value.value) &&
    boundedText(value.window, 1, 100);
}
