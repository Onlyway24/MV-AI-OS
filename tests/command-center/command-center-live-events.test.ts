import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RepositoryBackedCommandCenterEventSource,
  type CommandCenterEventSource,
} from "../../src/command-center/command-center-event-source.js";
import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
  COMMAND_CENTER_RESPONSIVE_CSS,
} from "../../src/command-center/command-center-assets.js";
import { PrivateCommandCenterServer, writeEventStream } from "../../src/command-center/command-center-server.js";
import {
  OPERATIONAL_EVENT_SEMANTICS,
  type OperationalEvent,
  type OperationalEventDraft,
  type OperationalEventType,
} from "../../src/operations-runtime/operational-event.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

describe("Command Center live event plane", () => {
  it("treats write=false as backpressure and bounds each connection buffer", () => {
    let writes = 0;
    const slow = { destroyed: false, writableEnded: false, writableLength: 0, write: () => { writes += 1; return false; } };
    expect(writeEventStream(slow, "event: heartbeat\n\n")).toBe(true);
    expect(writes).toBe(1);
    const saturated = { ...slow, writableLength: 262_144 };
    expect(writeEventStream(saturated, "x")).toBe(false);
    expect(writes).toBe(1);
  });

  it("uses event-triggered debounced refresh and only animates real runtime activity", () => {
    expect(COMMAND_CENTER_HTML).toContain("id=\"live-event-status\"");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("new EventSource(\"/api/events\")");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("acceptLiveCursor(event)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("scheduleLiveRefresh()");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("cursor_reset");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("stopLiveFallback();\n      setLiveEventState(\"live\", \"Eventi live · connessi\");\n      void refresh();");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("void refresh();\n  connectLiveEvents();");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("[data-runtime-activity=\"active\"] .cc-core-orbit");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("prefers-reduced-motion:no-preference");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("html{scroll-behavior:auto!important}");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("@media (max-width:820px){.cc-sidebar-foot{display:flex");
  });

  it("reads only the bound workspace through the production repository boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-command-center-events-"));
    const repositories = new SqliteRepositoryTransactionRunner({
      path: join(directory, "events.sqlite"),
      timeoutMs: 1_000,
    });
    try {
      await repositories.transaction(async ({ operationalEvents }) => {
        await operationalEvents.append(draftEvent(1, "JOB_QUEUED"));
        await operationalEvents.append(draftEvent(2, "HEALTH_STATE_CHANGED", "workspace-other"));
        await operationalEvents.append(draftEvent(3, "JOB_COMPLETED"));
      });
      const source = new RepositoryBackedCommandCenterEventSource(repositories, "workspace-local");
      await expect(source.cursorWindow()).resolves.toEqual({ latestSequence: 3, oldestSequence: 1 });
      await expect(source.listAfter(0, 10)).resolves.toMatchObject([
        { eventType: "JOB_QUEUED", sequence: 1, workspaceId: "workspace-local" },
        { eventType: "JOB_COMPLETED", sequence: 3, workspaceId: "workspace-local" },
      ]);
      expect(() => new RepositoryBackedCommandCenterEventSource(repositories, "invalid workspace"))
        .toThrow("Command Center event workspace is invalid");
    } finally {
      await repositories.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires the private session and trusted loopback origin, then replays after Last-Event-ID", async () => {
    const source = new FakeEventSource([
      event(1, "JOB_QUEUED"),
      event(2, "JOB_LEASE_ACQUIRED"),
      event(3, "JOB_COMPLETED"),
    ]);
    await withServer(source, {}, async ({ cookie, origin }) => {
      expect((await fetch(`${origin}/api/events`, { headers: { Accept: "text/event-stream" } })).status).toBe(401);
      expect((await fetch(`${origin}/api/events`, { headers: streamHeaders(cookie, "https://example.invalid") })).status).toBe(403);
      expect((await fetch(`${origin}/api/events`, { headers: { ...streamHeaders(cookie, origin), "Last-Event-ID": "not-a-cursor" } })).status).toBe(400);

      const controller = new AbortController();
      const response = await fetch(`${origin}/api/events`, {
        headers: { ...streamHeaders(cookie, origin), "Last-Event-ID": "1" },
        signal: controller.signal,
      });
      try {
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(response.headers.get("x-accel-buffering")).toBe("no");
        const received = await readUntil(response, "id: 3");
        expect(received).toContain("id: 2\nevent: operational");
        expect(received).toContain("id: 3\nevent: operational");
        expect(received).not.toContain("id: 1\nevent: operational");
        expect(received).not.toContain("rawPrompt");
      } finally {
        controller.abort();
      }
    });
  });

  it("signals an expired durable cursor and keeps the connection healthy with heartbeat", async () => {
    const source = new FakeEventSource([
      event(5, "JOB_RETRY_SCHEDULED"),
      event(6, "JOB_DEAD_LETTER"),
    ]);
    await withServer(source, { heartbeatMs: 20 }, async ({ cookie, origin }) => {
      const controller = new AbortController();
      const response = await fetch(`${origin}/api/events`, {
        headers: { ...streamHeaders(cookie, origin), "Last-Event-ID": "1" },
        signal: controller.signal,
      });
      const futureController = new AbortController();
      const futureResponse = await fetch(`${origin}/api/events`, {
        headers: { ...streamHeaders(cookie, origin), "Last-Event-ID": "99" },
        signal: futureController.signal,
      });
      try {
        const received = await readUntil(response, "event: heartbeat");
        expect(received).toContain("id: 6\nevent: cursor_reset");
        expect(received).toContain("EVENT_CURSOR_EXPIRED");
        expect(received).toContain("event: heartbeat");
        const reset = await readUntil(futureResponse, "event: cursor_reset");
        expect(reset).toContain("id: 6\nevent: cursor_reset");
        expect(reset).toContain("EVENT_CURSOR_AHEAD");
      } finally {
        controller.abort();
        futureController.abort();
      }
    });
  });

  it("resets to the authoritative snapshot when bounded replay would overflow", async () => {
    const source = new FakeEventSource([
      event(1, "JOB_QUEUED"),
      event(2, "JOB_LEASE_ACQUIRED"),
      event(3, "JOB_HEARTBEAT"),
      event(4, "JOB_COMPLETED"),
    ]);
    await withServer(source, { maxReplayEvents: 2 }, async ({ cookie, origin }) => {
      const controller = new AbortController();
      const response = await fetch(`${origin}/api/events`, {
        headers: { ...streamHeaders(cookie, origin), "Last-Event-ID": "0" },
        signal: controller.signal,
      });
      try {
        const reset = await readUntil(response, "event: cursor_reset");
        expect(reset).toContain("id: 4\nevent: cursor_reset");
        expect(reset).toContain("EVENT_REPLAY_LIMIT_EXCEEDED");
        expect(reset).not.toContain("event: operational");
      } finally {
        controller.abort();
      }
    });
  });

  it("fans out from each connection cursor, enforces a connection limit, and shuts down streams", async () => {
    const source = new FakeEventSource([event(1, "JOB_QUEUED")]);
    let closeServer: (() => Promise<void>) | undefined;
    await withServer(source, { connectionLimit: 2, pollIntervalMs: 1_000 }, async ({ close, cookie, origin }) => {
      closeServer = close;
      const firstController = new AbortController();
      const firstResponse = await fetch(`${origin}/api/events`, {
        headers: streamHeaders(cookie, origin),
        signal: firstController.signal,
      });
      source.push(event(2, "JOB_HEARTBEAT"));
      const secondController = new AbortController();
      const secondResponse = await fetch(`${origin}/api/events`, {
        headers: streamHeaders(cookie, origin),
        signal: secondController.signal,
      });
      const limited = await fetch(`${origin}/api/events`, { headers: streamHeaders(cookie, origin) });
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("3");

      source.push(event(3, "JOB_COMPLETED"));
      const firstLive = await readUntil(firstResponse, "id: 3");
      expect(firstLive.match(/id: 2\nevent: operational/gu)).toHaveLength(1);
      expect(firstLive.match(/id: 3\nevent: operational/gu)).toHaveLength(1);
      const secondLive = await readUntil(secondResponse, "id: 3");
      expect(secondLive).not.toContain("id: 2\nevent: operational");
      expect(secondLive.match(/id: 3\nevent: operational/gu)).toHaveLength(1);

      const closing = close();
      const [firstShutdown, secondShutdown] = await Promise.all([
        readUntil(firstResponse, "event: shutdown"),
        readUntil(secondResponse, "event: shutdown"),
      ]);
      expect(firstShutdown).toContain("COMMAND_CENTER_SHUTDOWN");
      expect(secondShutdown).toContain("COMMAND_CENTER_SHUTDOWN");
      await closing;
      firstController.abort();
      secondController.abort();
      closeServer = undefined;
    });
    await closeServer?.();
  });
});

class FakeEventSource implements CommandCenterEventSource {
  readonly #events: OperationalEvent[];

  public constructor(events: readonly OperationalEvent[]) {
    this.#events = [...events];
  }

  public cursorWindow() {
    const first = this.#events.at(0);
    const last = this.#events.at(-1);
    return Promise.resolve(last === undefined
      ? { latestSequence: 0 }
      : { latestSequence: last.sequence, ...(first === undefined ? {} : { oldestSequence: first.sequence }) });
  }

  public listAfter(afterSequence: number, limit: number) {
    return Promise.resolve(Object.freeze(this.#events.filter(({ sequence }) => sequence > afterSequence).slice(0, limit)));
  }

  public push(value: OperationalEvent): void {
    this.#events.push(value);
  }
}

function event(sequence: number, eventType: OperationalEventType): OperationalEvent {
  return Object.freeze({
    ...draftEvent(sequence, eventType),
    sequence,
  });
}

function draftEvent(
  sequence: number,
  eventType: OperationalEventType,
  workspaceId = "workspace-local",
): OperationalEventDraft {
  return Object.freeze({
    ...OPERATIONAL_EVENT_SEMANTICS[eventType],
    contractVersion: "1",
    entityId: "job-live-001",
    entityVersion: sequence,
    eventId: `event-live-${workspaceId}-${String(sequence).padStart(3, "0")}`,
    eventType,
    occurredAt: `2026-07-19T01:00:${String(sequence).padStart(2, "0")}.000Z`,
    workspaceId,
  });
}

async function withServer(
  source: CommandCenterEventSource,
  options: Readonly<{
    readonly connectionLimit?: number;
    readonly heartbeatMs?: number;
    readonly maxReplayEvents?: number;
    readonly pollIntervalMs?: number;
  }>,
  test: (input: Readonly<{ readonly close: () => Promise<void>; readonly cookie: string; readonly origin: string }>) => Promise<void>,
): Promise<void> {
  const server = new PrivateCommandCenterServer({
    accessToken: "a".repeat(64),
    eventPlane: { source, ...options },
    port: 0,
    queryService: { snapshot: () => Promise.reject(new Error("Snapshot is not used by this SSE test")) },
  });
  const started = await server.start();
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await started.close();
  };
  try {
    const origin = new URL(started.accessUrl).origin;
    const entry = await fetch(started.accessUrl, { redirect: "manual" });
    const cookie = entry.headers.get("set-cookie");
    if (cookie === null) throw new Error("Expected private Command Center cookie");
    await test({ close, cookie, origin });
  } finally {
    await close();
  }
}

function streamHeaders(cookie: string, origin: string): Readonly<Record<string, string>> {
  return { Accept: "text/event-stream", Cookie: cookie, Origin: origin };
}

interface ByteStreamReadResult {
  readonly done: boolean;
  readonly value?: Uint8Array;
}

interface ByteStreamReader {
  read(): Promise<ByteStreamReadResult>;
  releaseLock(): void;
}

async function readUntil(response: Response, marker: string): Promise<string> {
  if (response.body === null) throw new Error("Expected SSE response body");
  const reader: ByteStreamReader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  const deadline = Date.now() + 2_000;
  while (!received.includes(marker)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for SSE marker ${marker}`);
    const result: ByteStreamReadResult = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => { reject(new Error(`Timed out waiting for SSE marker ${marker}`)); }, remaining);
      }),
    ]);
    if (result.done) break;
    if (result.value === undefined) throw new Error("SSE reader returned no bytes");
    received += decoder.decode(result.value, { stream: true });
  }
  if (!received.includes(marker)) throw new Error(`SSE stream ended before marker ${marker}`);
  reader.releaseLock();
  return received;
}
