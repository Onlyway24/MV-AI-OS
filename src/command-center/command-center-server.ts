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

const LOCAL_HOST = "127.0.0.1";
const SESSION_COOKIE_NAME = "mv_ai_os_cc";
const ORIGINAL_BRAND_ASSET_PATH = fileURLToPath(new URL("../../assets/brand/onlyway-obsidian-chrome-original.png", import.meta.url));
const SOCIAL_VISUAL_PACK_ROOT = fileURLToPath(new URL("../../assets/metodo-veloce/social-pack-five-items-v3/", import.meta.url));
const SOCIAL_VISUAL_PACK_MANIFEST_PATH = fileURLToPath(new URL("../../assets/metodo-veloce/social-pack-five-items-v3/manifest.json", import.meta.url));

export interface CommandCenterServerOptions {
  readonly accessToken?: string;
  readonly actionService?: CommandCenterActionService;
  readonly port?: number;
  readonly queryService: CommandCenterQueryService;
}

export interface StartedCommandCenter {
  readonly accessUrl: string;
  readonly address: Readonly<{ readonly host: typeof LOCAL_HOST; readonly port: number }>;
  close(): Promise<void>;
}

/**
 * A loopback-only surface. Its two narrow mutations can only delegate to the
 * existing command and approval boundaries; browser requests never write SQLite.
 */
export class PrivateCommandCenterServer {
  readonly #accessToken: Buffer;
  readonly #actionService: CommandCenterActionService | undefined;
  readonly #csrfToken: string;
  readonly #port: number;
  readonly #queryService: CommandCenterQueryService;
  #server: Server | undefined;
  #started: StartedCommandCenter | undefined;

  public constructor(options: CommandCenterServerOptions) {
    this.#accessToken = tokenBytes(options.accessToken);
    this.#actionService = options.actionService;
    this.#csrfToken = randomBytes(32).toString("hex");
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
      if (requestUrl.pathname === "/api/session") {
        send(response, 200, "application/json; charset=utf-8", JSON.stringify({ csrfToken: this.#csrfToken }));
        return;
      }
      send(response, 404, "text/plain; charset=utf-8", "Risorsa non trovata");
    } catch (error) {
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

  async #handleAction(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
    port: number,
  ): Promise<void> {
    if (requestUrl.pathname !== "/api/actions/propose" && requestUrl.pathname !== "/api/actions/confirm") {
      send(response, 405, "text/plain; charset=utf-8", "Metodo non consentito", { Allow: "GET, HEAD" });
      return;
    }
    const csrfHeader = request.headers["x-onlyway-csrf"];
    if (this.#actionService === undefined || !hasTrustedOrigin(request, port) || !sameTextToken(this.#csrfToken, typeof csrfHeader === "string" ? csrfHeader : "")) {
      send(response, 403, "text/plain; charset=utf-8", "Azione locale non autorizzata");
      return;
    }
    const body = await parseJsonBody(request);
    if (requestUrl.pathname === "/api/actions/propose") {
      if (!record(body)) {
        send(response, 400, "text/plain; charset=utf-8", "Richiesta di azione non valida");
        return;
      }
      const proposal = isContentAction(body.action) && typeof body.productionId === "string"
        ? await this.#proposeContentReview(body.action, body.productionId, response)
        : isBusinessAction(body.action) && typeof body.missionId === "string"
          ? await this.#actionService.proposeBusinessReview({ action: body.action, missionId: body.missionId })
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
    const receipt = await this.#actionService.confirmReview({
        actionId: body.actionId,
        confirmationToken: body.confirmationToken,
        packageFingerprint: body.packageFingerprint,
    });
    send(response, 200, "application/json; charset=utf-8", JSON.stringify(receipt));
  }

  async #proposeContentReview(
    action: CommandCenterContentAction,
    productionId: string,
    response: ServerResponse,
  ): Promise<Awaited<ReturnType<CommandCenterActionService["proposeContentReview"]>> | undefined> {
    if (action === "APPROVE_CONTENT") {
      const snapshot = await this.#queryService.snapshot();
      const production = snapshot.productions.find((candidate) => candidate.productionId === productionId);
      if (production?.package.socialPublishingPack !== undefined) {
        const visualReview = await socialVisualReview();
        if (visualReview === undefined || visualReviewStatus(visualReview) !== "READY_FOR_HUMAN_DECISION") {
          send(response, 409, "text/plain; charset=utf-8", "Review visuale bloccata: serve il logo Metodo Veloce originale e la decisione estetica di Fabio");
          return undefined;
        }
      }
    }
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

async function socialVisualAsset(pathname: string): Promise<Buffer | undefined> {
  const match = /^\/assets\/metodo-veloce\/social-pack-five-items-v3\/(instagram|tiktok)\/(slide-(?:0[1-6])\.png)$/u.exec(pathname);
  if (match === null) return undefined;
  const platform = match[1];
  const filename = match[2];
  if (platform === undefined || filename === undefined) return undefined;
  return readFile(`${SOCIAL_VISUAL_PACK_ROOT}${platform}/${filename}`);
}

function visualReviewStatus(value: unknown): string | undefined {
  if (!record(value) || !record(value.visualReview)) return undefined;
  return typeof value.visualReview.status === "string" ? value.visualReview.status : undefined;
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
