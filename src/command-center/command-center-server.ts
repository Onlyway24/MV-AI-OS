import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_CSS,
  COMMAND_CENTER_HTML,
  COMMAND_CENTER_RESPONSIVE_CSS,
} from "./command-center-assets.js";
import type { CommandCenterQueryService } from "./command-center-query-service.js";

const LOCAL_HOST = "127.0.0.1";
const SESSION_COOKIE_NAME = "mv_ai_os_cc";

export interface CommandCenterServerOptions {
  readonly accessToken?: string;
  readonly port?: number;
  readonly queryService: CommandCenterQueryService;
}

export interface StartedCommandCenter {
  readonly accessUrl: string;
  readonly address: Readonly<{ readonly host: typeof LOCAL_HOST; readonly port: number }>;
  close(): Promise<void>;
}

/**
 * A loopback-only read surface. It deliberately contains no mutation endpoint:
 * browser reads cannot bypass the existing command and approval boundaries.
 */
export class PrivateCommandCenterServer {
  readonly #accessToken: Buffer;
  readonly #port: number;
  readonly #queryService: CommandCenterQueryService;
  #server: Server | undefined;
  #started: StartedCommandCenter | undefined;

  public constructor(options: CommandCenterServerOptions) {
    this.#accessToken = tokenBytes(options.accessToken);
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
      if (request.method !== "GET" && request.method !== "HEAD") {
        send(response, 405, "text/plain; charset=utf-8", "Metodo non consentito", {
          Allow: "GET, HEAD",
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
      if (requestUrl.pathname === "/api/overview") {
        const snapshot = await this.#queryService.snapshot();
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(snapshot));
        return;
      }
      send(response, 404, "text/plain; charset=utf-8", "Risorsa non trovata");
    } catch {
      send(response, 500, "text/plain; charset=utf-8", "L'API locale non ha potuto leggere il control plane");
    }
  }
}

function pageDocument(): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Centro di Comando Onlyway</title><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/responsive.css"></head><body>${COMMAND_CENTER_HTML}<script src="/app.js" defer></script></body></html>`;
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
  body: string,
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
