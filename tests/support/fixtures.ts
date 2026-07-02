import type {
  AgentManifest,
  Clock,
  IdentifierGenerator,
  IdentifierScope,
  LogEntry,
  Logger,
  RequestEnvelope,
} from "../../src/index.js";

export function createRequest(
  overrides: Partial<RequestEnvelope> = {},
): RequestEnvelope {
  return {
    actorId: "actor-local",
    contractVersion: "1",
    correlationId: "correlation-001",
    instruction: "Prepare a concise product announcement.",
    receivedAt: "2026-07-02T10:00:00.000Z",
    requestId: "request-001",
    requestedOutput: { contentType: "announcement" },
    source: "local",
    taskType: "business.content",
    workspaceId: "workspace-local",
    ...overrides,
  };
}

export function createManifest(
  overrides: Partial<AgentManifest> = {},
): AgentManifest {
  return {
    agentId: "content",
    description: "Produces structured business content.",
    handoffTargets: [],
    inputContract: {
      contractId: "business-content-input",
      contractVersion: "1",
    },
    instructionsRef: "agents/content/instructions@1.0.0",
    knowledgeAccess: [],
    limits: {
      maxResultBytes: 262_144,
      maxToolCalls: 0,
      timeoutMs: 30_000,
    },
    memoryAccess: {
      proposeWrites: true,
      read: ["conversation", "semantic", "user"],
    },
    modelProfile: "content-quality",
    name: "Content Agent",
    outputContract: {
      contractId: "content-output",
      contractVersion: "1",
    },
    riskLevel: "low",
    status: "active",
    taskTypes: ["business.content"],
    tools: [],
    version: "1.0.0",
    workflowProposals: [],
    ...overrides,
  };
}

export class FixedClock implements Clock {
  readonly #date: Date;

  public constructor(isoTimestamp = "2026-07-02T10:00:01.000Z") {
    this.#date = new Date(isoTimestamp);
  }

  public now(): Date {
    return new Date(this.#date);
  }
}

export class SequenceIdentifierGenerator implements IdentifierGenerator {
  #sequence = 0;

  public next(scope: IdentifierScope): string {
    this.#sequence += 1;
    return `${scope}-${String(this.#sequence)}`;
  }
}

export class RecordingLogger implements Logger {
  public readonly entries: LogEntry[] = [];

  public log(entry: LogEntry): void {
    this.entries.push(entry);
  }
}
