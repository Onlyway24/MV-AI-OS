import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";
import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_CSS,
  COMMAND_CENTER_HTML,
  COMMAND_CENTER_RESPONSIVE_CSS,
} from "./command-center-assets.js";
import {
  CommandCenterActionService,
  type CommandCenterBusinessAction,
  type CommandCenterContentAction,
} from "./command-center-action-service.js";
import { RepositoryConflictError } from "../errors/core-error.js";
import type { CommandCenterQueryService } from "./command-center-query-service.js";
import { socialAnalyticsCsvTemplate } from "../social-intelligence-live/social-analytics-csv-adapter.js";
import { competitorObservationsCsvTemplate } from "../social-intelligence-live/social-competitor-observation-csv-adapter.js";
import { audioRightsCsvTemplate } from "../social-intelligence-live/social-audio-rights-csv-adapter.js";
import type { OperationalEvent } from "../operations-runtime/operational-event.js";
import type { OperationsControlService } from "../operations-control/operations-control-service.js";
import type {
  CommandCenterEventPlaneOptions,
  CommandCenterEventSource,
} from "./command-center-event-source.js";

const LOCAL_HOST = "127.0.0.1";
const SESSION_COOKIE_NAME = "mv_ai_os_cc";
const DEFAULT_EVENT_CONNECTION_LIMIT = 8;
const DEFAULT_EVENT_HEARTBEAT_MS = 15_000;
const DEFAULT_EVENT_MAX_REPLAY = 500;
const DEFAULT_EVENT_POLL_INTERVAL_MS = 750;
const EVENT_BATCH_SIZE = 100;
const MAX_EVENT_STREAM_BUFFER_BYTES = 262_144;
const ORIGINAL_BRAND_ASSET_PATH = fileURLToPath(new URL("../../assets/brand/onlyway-obsidian-chrome-original.png", import.meta.url));
const SOCIAL_VISUAL_PACK_ROOT = fileURLToPath(new URL("../../assets/metodo-veloce/social-pack-five-items-v3/", import.meta.url));
const SOCIAL_VISUAL_PACK_MANIFEST_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/social-pack-five-items-v3/manifest.json", import.meta.url));
const BRAND_MEDIA_FACTORY_ROOT = fileURLToPath(new URL("../../assets/metodo-veloce/live-ai-brand-media-pilot-v1/", import.meta.url));
const BRAND_MEDIA_FACTORY_STATUS_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/live-ai-brand-media-pilot-v1/pilot-status.json", import.meta.url));
const BRAND_MEDIA_FACTORY_APPROVAL_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/live-ai-brand-media-pilot-v1/approval-manifest.json", import.meta.url));
const OPENAI_TEXT_DIAGNOSIS_STATUS_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/openai-text-failure-diagnosis-v1/diagnosis-status.json", import.meta.url));
const OPENAI_RESPONSES_CONFORMANCE_STATUS_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/openai-responses-conformance-v1/conformance-status.json", import.meta.url));
const MEDIA_QUALITY_ROOT = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/", import.meta.url));
const MEDIA_QUALITY_APPROVAL_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/approval-manifest.json", import.meta.url));
const MEDIA_QUALITY_LIVE_RESULT_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/live-result.json", import.meta.url));
const SOCIAL_CONNECTOR_STATUS_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/social-connector-status.json", import.meta.url));

export interface CommandCenterServerOptions {
  readonly accessToken?: string;
  readonly actionService?: CommandCenterActionService;
  readonly eventPlane?: CommandCenterEventPlaneOptions;
  readonly operationsControlService?: Pick<OperationsControlService, "confirmForOperator" | "proposeForOperator">;
  readonly port?: number;
  readonly queryService: Pick<CommandCenterQueryService, "snapshot">;
}

export interface StartedCommandCenter {
  readonly accessUrl: string;
  readonly address: Readonly<{ readonly host: typeof LOCAL_HOST; readonly port: number }>;
  close(): Promise<void>;
}

interface EventStreamConnection {
  cursor: number;
  readonly response: ServerResponse;
}

/**
 * A loopback-only surface. Mutations delegate to explicit application-service
 * boundaries; browser request handlers never write SQLite directly.
 */
export class PrivateCommandCenterServer {
  readonly #accessToken: Buffer;
  readonly #actionService: CommandCenterActionService | undefined;
  readonly #csrfToken: string;
  readonly #eventConnectionLimit: number;
  readonly #eventHeartbeatMs: number;
  readonly #eventMaxReplay: number;
  readonly #eventPollIntervalMs: number;
  readonly #eventSource: CommandCenterEventSource | undefined;
  readonly #operationsControlService: Pick<OperationsControlService, "confirmForOperator" | "proposeForOperator"> | undefined;
  readonly #port: number;
  readonly #queryService: Pick<CommandCenterQueryService, "snapshot">;
  readonly #eventConnections = new Set<EventStreamConnection>();
  #eventHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
  #eventPollTimer: ReturnType<typeof setInterval> | undefined;
  #eventPumpRunning = false;
  #server: Server | undefined;
  #started: StartedCommandCenter | undefined;

  public constructor(options: CommandCenterServerOptions) {
    this.#accessToken = tokenBytes(options.accessToken);
    this.#actionService = options.actionService;
    this.#csrfToken = randomBytes(32).toString("hex");
    this.#eventSource = options.eventPlane?.source;
    this.#eventConnectionLimit = boundedInteger(options.eventPlane?.connectionLimit, DEFAULT_EVENT_CONNECTION_LIMIT, 1, 32, "limite connessioni SSE");
    this.#eventHeartbeatMs = boundedInteger(options.eventPlane?.heartbeatMs, DEFAULT_EVENT_HEARTBEAT_MS, 10, 60_000, "intervallo heartbeat SSE");
    this.#eventMaxReplay = boundedInteger(options.eventPlane?.maxReplayEvents, DEFAULT_EVENT_MAX_REPLAY, 1, 2_000, "limite replay SSE");
    this.#eventPollIntervalMs = boundedInteger(options.eventPlane?.pollIntervalMs, DEFAULT_EVENT_POLL_INTERVAL_MS, 10, 10_000, "intervallo event plane");
    this.#operationsControlService = options.operationsControlService;
    this.#port = options.port ?? 0;
    this.#queryService = options.queryService;
  }

  public async start(): Promise<StartedCommandCenter> {
    if (this.#started !== undefined) return this.#started;
    const server = createServer((request, response) => {
      void this.#handle(request, response);
    });
    await listen(server, this.#port);
    const address = server.address();
    if (address === null || typeof address === "string") {
      await closeServer(server);
      throw new Error("Il Centro di Comando non ha eseguito il binding a un indirizzo TCP loopback");
    }
    if (address.address !== LOCAL_HOST) {
      await closeServer(server);
      throw new Error("Il Centro di Comando ha rifiutato un binding non-loopback");
    }
    const port = address.port;
    const token = this.#accessToken.toString("hex");
    this.#server = server;
    this.#started = Object.freeze({
      accessUrl: `http://${LOCAL_HOST}:${String(port)}/?access_token=${token}`,
      address: Object.freeze({ host: LOCAL_HOST, port }),
      close: async () => {
        if (this.#server !== undefined) {
          const active = this.#server;
          this.#server = undefined;
          this.#started = undefined;
          this.#shutdownEventPlane();
          await closeServer(active);
        }
      },
    });
    return this.#started;
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const started = this.#started;
      if (started === undefined || !isLoopbackHost(request, started.address.port)) {
        send(response, 400, "text/plain; charset=utf-8", "Host locale non valido");
        return;
      }
      const requestUrl = new URL(
        request.url ?? "/",
        `http://${LOCAL_HOST}:${String(started.address.port)}`,
      );
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
        send(response, 405, "text/plain; charset=utf-8", "Metodo non consentito", {
          Allow: "GET, HEAD, POST",
        });
        return;
      }
      const presentedToken = requestUrl.searchParams.get("access_token");
      if (presentedToken !== null) {
        if (!sameToken(this.#accessToken, presentedToken)) {
          send(response, 401, "text/plain; charset=utf-8", "Non autorizzato");
          return;
        }
        response.writeHead(303, securityHeaders({
          Location: "/",
          "Set-Cookie": `${SESSION_COOKIE_NAME}=${this.#accessToken.toString("hex")}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
        }));
        response.end();
        return;
      }
      if (!hasSession(request, this.#accessToken)) {
        send(response, 401, "text/plain; charset=utf-8", "È richiesto l'accesso locale privato");
        return;
      }
      if (requestUrl.pathname === "/api/events") {
        await this.#handleEventStream(request, response, started.address.port);
        return;
      }
      if (request.method === "POST") {
        await this.#handleAction(request, response, requestUrl, started.address.port);
        return;
      }
      if (requestUrl.pathname === "/") {
        send(response, 200, "text/html; charset=utf-8", pageDocument());
        return;
      }
      if (requestUrl.pathname === "/app.css") {
        send(response, 200, "text/css; charset=utf-8", COMMAND_CENTER_CSS);
        return;
      }
      if (requestUrl.pathname === "/responsive.css") {
        send(response, 200, "text/css; charset=utf-8", COMMAND_CENTER_RESPONSIVE_CSS);
        return;
      }
      if (requestUrl.pathname === "/app.js") {
        send(response, 200, "text/javascript; charset=utf-8", COMMAND_CENTER_CLIENT_JS);
        return;
      }
      if (requestUrl.pathname === "/assets/brand/onlyway-obsidian-chrome-original.png") {
        const asset = await originalBrandAsset();
        if (asset === undefined) {
          send(response, 404, "text/plain; charset=utf-8", "Asset del brand non ancora installato");
          return;
        }
        send(response, 200, "image/png", asset);
        return;
      }
      const visualAsset = await socialVisualAsset(requestUrl.pathname);
      if (visualAsset !== undefined) {
        send(response, 200, "image/png", visualAsset);
        return;
      }
      const factoryAsset = await brandMediaFactoryVisualAsset(requestUrl.pathname);
      if (factoryAsset !== undefined) {
        send(response, 200, "image/png", factoryAsset);
        return;
      }
      const qualityAsset = await mediaQualityVisualAsset(requestUrl.pathname);
      if (qualityAsset !== undefined) {
        send(response, 200, qualityAsset.contentType, qualityAsset.bytes);
        return;
      }
      if (requestUrl.pathname === "/downloads/metodo-veloce-insights-template.csv") {
        send(response, 200, "text/csv; charset=utf-8", socialAnalyticsCsvTemplate(), { "Content-Disposition": "attachment; filename=metodo-veloce-insights-template.csv" });
        return;
      }
      if (requestUrl.pathname === "/downloads/metodo-veloce-competitor-observations-template.csv") {
        send(response, 200, "text/csv; charset=utf-8", competitorObservationsCsvTemplate(), { "Content-Disposition": "attachment; filename=metodo-veloce-competitor-observations-template.csv" });
        return;
      }
      if (requestUrl.pathname === "/downloads/metodo-veloce-audio-rights-template.csv") {
        send(response, 200, "text/csv; charset=utf-8", audioRightsCsvTemplate(), { "Content-Disposition": "attachment; filename=metodo-veloce-audio-rights-template.csv" });
        return;
      }
      if (requestUrl.pathname === "/api/overview") {
        const snapshot = await this.#queryService.snapshot();
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(snapshot));
        return;
      }
      if (requestUrl.pathname === "/api/social-visual-review") {
        const visualReview = await socialVisualReview();
        if (visualReview === undefined) {
          send(response, 404, "text/plain; charset=utf-8", "Review visuale non ancora disponibile");
          return;
        }
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(visualReview));
        return;
      }
      if (requestUrl.pathname === "/api/brand-media-factory") {
        const factoryStatus = await brandMediaFactoryStatus();
        if (factoryStatus === undefined) {
          send(response, 404, "text/plain; charset=utf-8", "Pilot media non ancora disponibile");
          return;
        }
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(factoryStatus));
        return;
      }
      if (requestUrl.pathname === "/api/session") {
        send(response, 200, "application/json; charset=utf-8", JSON.stringify({ csrfToken: this.#csrfToken }));
        return;
      }
      send(response, 404, "text/plain; charset=utf-8", "Risorsa non trovata");
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof RepositoryConflictError) {
        send(response, 409, "text/plain; charset=utf-8", error.message);
        return;
      }
      if (request.method === "POST") {
        send(response, 400, "text/plain; charset=utf-8", "La richiesta di azione non è valida");
        return;
      }
      send(response, 500, "text/plain; charset=utf-8", "L'API locale non ha potuto leggere il control plane");
    }
  }

  async #handleEventStream(
    request: IncomingMessage,
    response: ServerResponse,
    port: number,
  ): Promise<void> {
    if (request.method !== "GET") {
      send(response, 405, "text/plain; charset=utf-8", "Metodo non consentito", { Allow: "GET" });
      return;
    }
    if (this.#eventSource === undefined) {
      send(response, 503, "text/plain; charset=utf-8", "Event plane locale non disponibile", { "Retry-After": "3" });
      return;
    }
    if (!hasTrustedOptionalOrigin(request, port)) {
      send(response, 403, "text/plain; charset=utf-8", "Stream locale non autorizzato");
      return;
    }
    if (!acceptsEventStream(request)) {
      send(response, 406, "text/plain; charset=utf-8", "È richiesto text/event-stream");
      return;
    }
    if (this.#eventConnections.size >= this.#eventConnectionLimit) {
      send(response, 429, "text/plain; charset=utf-8", "Limite connessioni live raggiunto", { "Retry-After": "3" });
      return;
    }
    const requestedCursor = lastEventCursor(request);
    if (requestedCursor === false) {
      send(response, 400, "text/plain; charset=utf-8", "Last-Event-ID non valido");
      return;
    }

    const window = await this.#eventSource.cursorWindow();
    let cursor = requestedCursor ?? window.latestSequence;
    let resetReason: EventCursorResetReason | undefined;
    if (requestedCursor !== undefined && cursor > window.latestSequence) {
      resetReason = "EVENT_CURSOR_AHEAD";
    } else if (requestedCursor !== undefined && window.oldestSequence !== undefined && cursor < window.oldestSequence - 1) {
      resetReason = "EVENT_CURSOR_EXPIRED";
    }
    let resetRequired = resetReason !== undefined;
    let replay: readonly OperationalEvent[] = [];
    if (!resetRequired && requestedCursor !== undefined) {
      const loaded = await this.#loadReplay(cursor, window.latestSequence);
      if (loaded === undefined) {
        resetRequired = true;
        resetReason = "EVENT_REPLAY_LIMIT_EXCEEDED";
      }
      else replay = loaded;
    }

    response.writeHead(200, securityHeaders({
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    }));
    response.flushHeaders();
    if (!writeEventStream(response, "retry: 2000\n\n")) {
      response.end();
      return;
    }

    if (resetRequired) {
      cursor = window.latestSequence;
      if (!writeEventStream(response, cursorResetFrame(cursor, resetReason ?? "EVENT_CURSOR_EXPIRED"))) {
        response.end();
        return;
      }
    } else {
      for (const event of replay) {
        if (event.sequence <= cursor) continue;
        if (!writeEventStream(response, operationalEventFrame(event))) {
          response.end();
          return;
        }
        cursor = event.sequence;
      }
    }

    const connection: EventStreamConnection = { cursor, response };
    this.#eventConnections.add(connection);
    request.once("close", () => { this.#removeEventConnection(connection); });
    response.once("close", () => { this.#removeEventConnection(connection); });
    this.#startEventPlane();
    void this.#pumpEvents();
  }

  async #loadReplay(
    afterSequence: number,
    initialHighWatermark: number,
  ): Promise<readonly OperationalEvent[] | undefined> {
    const source = this.#eventSource;
    if (source === undefined) return [];
    const events: OperationalEvent[] = [];
    let cursor = afterSequence;
    while (cursor < initialHighWatermark) {
      const remaining = this.#eventMaxReplay - events.length;
      if (remaining <= 0) return undefined;
      const cursorBeforeBatch = cursor;
      const batch = await source.listAfter(cursor, Math.min(EVENT_BATCH_SIZE, remaining + 1));
      for (const event of batch) {
        if (event.sequence <= cursor) continue;
        events.push(event);
        cursor = event.sequence;
        if (events.length > this.#eventMaxReplay) return undefined;
      }
      if (cursor === cursorBeforeBatch || batch.length < Math.min(EVENT_BATCH_SIZE, remaining + 1)) break;
    }
    return Object.freeze(events);
  }

  #startEventPlane(): void {
    if (this.#eventPollTimer === undefined) {
      this.#eventPollTimer = setInterval(() => { void this.#pumpEvents(); }, this.#eventPollIntervalMs);
    }
    if (this.#eventHeartbeatTimer === undefined) {
      this.#eventHeartbeatTimer = setInterval(() => { this.#heartbeatEventConnections(); }, this.#eventHeartbeatMs);
    }
  }

  async #pumpEvents(): Promise<void> {
    const source = this.#eventSource;
    if (source === undefined || this.#eventConnections.size === 0 || this.#eventPumpRunning) return;
    this.#eventPumpRunning = true;
    try {
      const window = await source.cursorWindow();
      for (const connection of [...this.#eventConnections]) {
        if (window.oldestSequence === undefined || connection.cursor >= window.oldestSequence - 1) continue;
        connection.cursor = window.latestSequence;
        if (!writeEventStream(connection.response, cursorResetFrame(connection.cursor, "EVENT_CURSOR_EXPIRED"))) {
          this.#removeEventConnection(connection);
        }
      }
      if (this.#eventConnections.size === 0) return;
      const after = Math.min(...[...this.#eventConnections].map(({ cursor }) => cursor));
      const events = await source.listAfter(after, EVENT_BATCH_SIZE);
      for (const event of events) {
        for (const connection of [...this.#eventConnections]) {
          if (event.sequence <= connection.cursor) continue;
          if (!writeEventStream(connection.response, operationalEventFrame(event))) {
            this.#removeEventConnection(connection);
            continue;
          }
          connection.cursor = event.sequence;
        }
      }
    } catch {
      for (const connection of [...this.#eventConnections]) {
        writeEventStream(connection.response, "event: source_unavailable\ndata: {\"reasonCode\":\"EVENT_SOURCE_UNAVAILABLE\"}\n\n");
        this.#removeEventConnection(connection);
      }
    } finally {
      this.#eventPumpRunning = false;
    }
  }

  #heartbeatEventConnections(): void {
    const frame = `event: heartbeat\ndata: ${JSON.stringify({ contractVersion: "1", generatedAt: new Date().toISOString() })}\n\n`;
    for (const connection of [...this.#eventConnections]) {
      if (!writeEventStream(connection.response, frame)) this.#removeEventConnection(connection);
    }
  }

  #removeEventConnection(connection: EventStreamConnection): void {
    if (!this.#eventConnections.delete(connection)) return;
    if (!connection.response.writableEnded) connection.response.end();
    if (this.#eventConnections.size === 0) {
      if (this.#eventPollTimer !== undefined) clearInterval(this.#eventPollTimer);
      if (this.#eventHeartbeatTimer !== undefined) clearInterval(this.#eventHeartbeatTimer);
      this.#eventPollTimer = undefined;
      this.#eventHeartbeatTimer = undefined;
    }
  }

  #shutdownEventPlane(): void {
    if (this.#eventPollTimer !== undefined) clearInterval(this.#eventPollTimer);
    if (this.#eventHeartbeatTimer !== undefined) clearInterval(this.#eventHeartbeatTimer);
    this.#eventPollTimer = undefined;
    this.#eventHeartbeatTimer = undefined;
    for (const connection of [...this.#eventConnections]) {
      writeEventStream(connection.response, "event: shutdown\ndata: {\"reasonCode\":\"COMMAND_CENTER_SHUTDOWN\"}\n\n");
      this.#eventConnections.delete(connection);
      if (!connection.response.writableEnded) connection.response.end();
    }
  }

  async #handleAction(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
    port: number,
  ): Promise<void> {
    const legacyAction = requestUrl.pathname === "/api/actions/propose" || requestUrl.pathname === "/api/actions/confirm";
    const operationsControlAction = requestUrl.pathname === "/api/control-actions/propose" || requestUrl.pathname === "/api/control-actions/confirm";
    if (!legacyAction && !operationsControlAction) {
      send(response, 405, "text/plain; charset=utf-8", "Metodo non consentito", { Allow: "GET, HEAD" });
      return;
    }
    const csrfHeader = request.headers["x-onlyway-csrf"];
    const actionService = this.#actionService;
    const operationsControlService = this.#operationsControlService;
    if (!hasTrustedOrigin(request, port) || !sameTextToken(this.#csrfToken, typeof csrfHeader === "string" ? csrfHeader : "")) {
      send(response, 403, "text/plain; charset=utf-8", "Azione locale non autorizzata");
      return;
    }
    if (operationsControlAction && operationsControlService === undefined) {
      send(response, 503, "text/plain; charset=utf-8", "Control action boundary non disponibile");
      return;
    }
    if (legacyAction && actionService === undefined) {
      send(response, 503, "text/plain; charset=utf-8", "Action boundary non disponibile");
      return;
    }
    const body = await parseJsonBody(request);
    if (requestUrl.pathname === "/api/control-actions/propose") {
      if (operationsControlService === undefined) throw new Error("Control action boundary unavailable after authorization");
      const proposal = await operationsControlService.proposeForOperator(body);
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(proposal));
      return;
    }
    if (requestUrl.pathname === "/api/control-actions/confirm") {
      if (operationsControlService === undefined) throw new Error("Control action boundary unavailable after authorization");
      const receipt = await operationsControlService.confirmForOperator(body);
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(receipt));
      return;
    }
    if (actionService === undefined) throw new Error("Action boundary unavailable after authorization");
    if (requestUrl.pathname === "/api/actions/propose") {
      if (!record(body)) {
        send(response, 400, "text/plain; charset=utf-8", "Richiesta di azione non valida");
        return;
      }
      const proposal = isContentAction(body.action) && typeof body.productionId === "string"
        ? await this.#proposeContentReview(body.action, body.productionId)
        : isBusinessAction(body.action) && typeof body.missionId === "string"
          ? await actionService.proposeBusinessReview({ action: body.action, missionId: body.missionId })
          : undefined;
      if (proposal === undefined) {
        if (!response.headersSent) send(response, 400, "text/plain; charset=utf-8", "Richiesta di azione non valida");
        return;
      }
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(proposal));
      return;
    }
    if (!record(body) || typeof body.actionId !== "string" || typeof body.confirmationToken !== "string" || typeof body.packageFingerprint !== "string") {
      send(response, 400, "text/plain; charset=utf-8", "Conferma dell'azione non valida");
      return;
    }
    const receipt = await actionService.confirmReview({
      actionId: body.actionId,
      confirmationToken: body.confirmationToken,
      packageFingerprint: body.packageFingerprint,
    });
    send(response, 200, "application/json; charset=utf-8", JSON.stringify(receipt));
  }

  async #proposeContentReview(
    action: CommandCenterContentAction,
    productionId: string,
  ): Promise<Awaited<ReturnType<CommandCenterActionService["proposeContentReview"]>> | undefined> {
    return this.#actionService?.proposeContentReview({ action, productionId });
  }
}

function pageDocument(): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Centro di Comando Onlyway</title><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/responsive.css"></head><body>${COMMAND_CENTER_HTML}<script src="/app.js" defer></script></body></html>`;
}

async function originalBrandAsset(): Promise<Buffer | undefined> {
  try {
    return await readFile(ORIGINAL_BRAND_ASSET_PATH);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function socialVisualReview(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(SOCIAL_VISUAL_PACK_MANIFEST_PATH, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function brandMediaFactoryStatus(): Promise<unknown> {
  let factory: unknown;
  for (const path of [MEDIA_QUALITY_APPROVAL_PATH, MEDIA_QUALITY_LIVE_RESULT_PATH]) {
    try {
      factory = JSON.parse(await readFile(path, "utf8")) as unknown;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  try {
    if (factory === undefined) factory = JSON.parse(await readFile(BRAND_MEDIA_FACTORY_APPROVAL_PATH, "utf8")) as unknown;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  if (factory === undefined) {
    try {
      factory = JSON.parse(await readFile(BRAND_MEDIA_FACTORY_STATUS_PATH, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }
  if (!record(factory)) return factory;
  const additions: Record<string, unknown> = {};
  const statuses = [
    ["diagnosis", OPENAI_TEXT_DIAGNOSIS_STATUS_PATH],
    ["responsesConformance", OPENAI_RESPONSES_CONFORMANCE_STATUS_PATH],
  ] as const;
  for (const [name, path] of statuses) {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (record(value)) additions[name] = value;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  try {
    const value = JSON.parse(await readFile(SOCIAL_CONNECTOR_STATUS_PATH, "utf8")) as unknown;
    if (record(value)) additions.socialConnections = value;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  return { ...factory, ...additions };
}

async function mediaQualityVisualAsset(pathname: string): Promise<{ readonly bytes: Buffer; readonly contentType: "image/jpeg" | "image/png" } | undefined> {
  const match = /^\/assets\/metodo-veloce\/media-factory-quality-closure-v1\/(master-openai\.png|rendered\/(?:instagram-1080x1350\.png|tiktok-1080x1920\.png|preview-instagram\.jpg|preview-tiktok\.jpg|contact-sheet\.jpg))$/u.exec(pathname);
  const relative = match?.[1];
  if (relative === undefined) return undefined;
  return {
    bytes: await readFile(`${MEDIA_QUALITY_ROOT}${relative}`),
    contentType: relative.endsWith(".png") ? "image/png" : "image/jpeg",
  };
}

async function socialVisualAsset(pathname: string): Promise<Buffer | undefined> {
  const match = /^\/assets\/metodo-veloce\/social-pack-five-items-v3\/(instagram|tiktok)\/(slide-(?:0[1-6])\.png)$/u.exec(pathname);
  if (match === null) return undefined;
  const platform = match[1];
  const filename = match[2];
  if (platform === undefined || filename === undefined) return undefined;
  return readFile(`${SOCIAL_VISUAL_PACK_ROOT}${platform}/${filename}`);
}

async function brandMediaFactoryVisualAsset(pathname: string): Promise<Buffer | undefined> {
  const match = /^\/assets\/metodo-veloce\/live-ai-brand-media-pilot-v1\/(master-openai|instagram-local-variant|tiktok-local-variant)\.png$/u.exec(pathname);
  if (match?.[1] === undefined) return undefined;
  return readFile(`${BRAND_MEDIA_FACTORY_ROOT}${match[1]}.png`);
}

function tokenBytes(input: string | undefined): Buffer {
  if (input === undefined) return randomBytes(32);
  if (!/^[a-f0-9]{64}$/u.test(input)) {
    throw new Error("Il token di accesso del Centro di Comando deve essere un valore esadecimale minuscolo di 64 caratteri");
  }
  return Buffer.from(input, "hex");
}

function sameToken(expected: Buffer, received: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(received)) return false;
  const candidate = Buffer.from(received, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sameTextToken(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(received)) return false;
  return sameToken(Buffer.from(expected, "hex"), received);
}

function hasSession(request: IncomingMessage, token: Buffer): boolean {
  const cookie = request.headers.cookie;
  if (cookie === undefined) return false;
  const value = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  return value !== undefined && sameToken(token, value);
}

function hasTrustedOrigin(request: IncomingMessage, port: number): boolean {
  return request.headers.origin === `http://${LOCAL_HOST}:${String(port)}`;
}

function hasTrustedOptionalOrigin(request: IncomingMessage, port: number): boolean {
  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${LOCAL_HOST}:${String(port)}`;
}

function acceptsEventStream(request: IncomingMessage): boolean {
  const accept = request.headers.accept;
  return typeof accept === "string" && accept.split(",").some((value) => value.trim().split(";", 1)[0] === "text/event-stream");
}

function lastEventCursor(request: IncomingMessage): number | undefined | false {
  const value = request.headers["last-event-id"];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,15})$/u.test(value)) return false;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : false;
}

function operationalEventFrame(event: OperationalEvent): string {
  return `id: ${String(event.sequence)}\nevent: operational\ndata: ${JSON.stringify(event)}\n\n`;
}

type EventCursorResetReason =
  | "EVENT_CURSOR_AHEAD"
  | "EVENT_CURSOR_EXPIRED"
  | "EVENT_REPLAY_LIMIT_EXCEEDED";

function cursorResetFrame(cursor: number, reasonCode: EventCursorResetReason): string {
  return `id: ${String(cursor)}\nevent: cursor_reset\ndata: ${JSON.stringify({ contractVersion: "1", reasonCode })}\n\n`;
}

export interface EventStreamWritable {
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
  readonly writableLength: number;
  write(frame: string): boolean;
}

/**
 * `ServerResponse.write()` returning false signals backpressure, not failure.
 * Keep the already-buffered frame and let Node drain it; disconnect only when
 * the explicitly bounded per-connection buffer would be exceeded. The client
 * then resumes through Last-Event-ID without an unbounded heap queue.
 */
export function writeEventStream(response: EventStreamWritable, frame: string): boolean {
  if (response.destroyed || response.writableEnded) return false;
  if (response.writableLength + Buffer.byteLength(frame, "utf8") > MAX_EVENT_STREAM_BUFFER_BYTES) return false;
  response.write(frame);
  return eventStreamOpen(response);
}

function eventStreamOpen(response: EventStreamWritable): boolean {
  return !response.destroyed && !response.writableEnded;
}

function boundedInteger(
  candidate: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const value = candidate ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Configurazione ${label} non valida`);
  return value;
}

async function parseJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
    throw new Error("Il contenuto dell'azione deve essere JSON");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 16_384) throw new Error("La richiesta di azione supera la dimensione massima consentita");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Il JSON dell'azione non è valido");
  }
}

function isContentAction(value: unknown): value is CommandCenterContentAction {
  return value === "APPROVE_CONTENT" || value === "REJECT_CONTENT";
}

function isBusinessAction(value: unknown): value is CommandCenterBusinessAction { return value === "APPROVE_BUSINESS" || value === "REJECT_BUSINESS" || value === "REQUEST_BUSINESS_REVISION"; }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoopbackHost(request: IncomingMessage, port: number): boolean {
  const host = request.headers.host;
  return host === `${LOCAL_HOST}:${String(port)}`;
}

function securityHeaders(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  extra: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, securityHeaders({
    "Content-Type": contentType,
    "Content-Length": String(Buffer.byteLength(body)),
    ...extra,
  }));
  response.end(body);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: LOCAL_HOST, port }, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
}
