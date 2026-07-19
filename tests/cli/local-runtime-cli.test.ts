import { execFile, spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  CliRequestParser,
  DEFAULT_FOUNDER_MISSION_BRIEF,
  LocalCliConfigValidator,
  type LocalCliConfig,
  type LocalRuntime,
  type LocalRuntimeConfig,
  RequestEnvelopeValidator,
  type TaskResponse,
} from "../../src/index.js";
import {
  LOCAL_CLI_EXIT_CODE,
  type LocalCliHost,
  runLocalRuntimeCli,
} from "../../src/cli/local-runtime-cli.js";
import { createRequest } from "../support/fixtures.js";

const executeFile = promisify(execFile);
let buildDirectory: string;
let cliPath: string;

beforeAll(async () => {
  buildDirectory = await mkdtemp(join(tmpdir(), "mv-ai-os-cli-build-"));
  await executeFile(
    resolve("node_modules/.bin/tsc"),
    [
      "--project",
      "tsconfig.build.json",
      "--outDir",
      buildDirectory,
      "--declaration",
      "false",
      "--declarationMap",
      "false",
      "--sourceMap",
      "false",
    ],
    { cwd: resolve(".") },
  );
  cliPath = join(buildDirectory, "cli", "local-runtime-cli.js");
});

afterAll(async () => {
  await rm(buildDirectory, { force: true, recursive: true });
});

describe("Controlled local CLI contracts", () => {
  it("validates configuration and rejects unknown or unsafe fields", () => {
    const validator = new LocalCliConfigValidator();
    const valid = createCliConfig("/tmp/runtime.sqlite");

    expect(validator.validate(valid)).toEqual({
      ok: true,
      value: valid,
    });
    expect(
      validator.validate({
        ...valid,
        unsupported: true,
      }),
    ).toMatchObject({
      issues: [{ code: "unexpected", path: "unsupported" }],
      ok: false,
    });
    expect(
      validator.validate({
        ...valid,
        maxRequestBytes: 1_048_577,
      }),
    ).toMatchObject({
      issues: [{ code: "too_large", path: "maxRequestBytes" }],
      ok: false,
    });
  });

  it("parses only bounded, valid RequestEnvelope JSON", () => {
    const parser = new CliRequestParser(new RequestEnvelopeValidator());
    const valid = Buffer.from(JSON.stringify(createRequest()));

    expect(parser.parse(valid, valid.byteLength)).toEqual(createRequest());
    expect(() => parser.parse(Buffer.from("{"), 10)).toThrow(
      expect.objectContaining({ code: "cli_request_json_invalid" }),
    );
    expect(() => parser.parse(valid, valid.byteLength - 1)).toThrow(
      expect.objectContaining({ code: "cli_request_too_large" }),
    );
    expect(() =>
      parser.parse(
        Buffer.from(
          JSON.stringify(createRequest({ source: "api" })),
        ),
        65_536,
      ),
    ).toThrow(
      expect.objectContaining({ code: "cli_request_source_invalid" }),
    );
  });

  it("closes the runtime once when termination is requested", async () => {
    const runtime = new RecordingRuntime();
    const input = new ControllableInput();
    const host = new RecordingHost(runtime, input);
    const execution = runLocalRuntimeCli(host);
    await host.runtimeCreated;
    await Promise.resolve();

    host.signal("SIGTERM");
    input.end();
    await expect(host.terminated).resolves.toBe(
      LOCAL_CLI_EXIT_CODE.terminated,
    );
    await expect(execution).resolves.toBe(
      LOCAL_CLI_EXIT_CODE.invalidInput,
    );
    expect(runtime.closeCount).toBe(1);
  });
});

describe("Controlled local CLI process", () => {
  it("executes allowlisted Workflow commands through the existing CLI and survives restart", async () => {
    await withTemporaryDirectory(async (directory) => {
      const configPath = await writeConfig(directory, { databaseName: "workflow-command.sqlite" });
      const definition = { contractVersion: "1", definitionId: "cli-workflow@1.0.0", missionObjective: "Prepare a bounded local content direction.", nonExecuting: true, steps: [{ approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "direction" }], workflowId: "cli-workflow", workflowVersion: "1.0.0" };
      const instance = { contractVersion: "1", createdAt: "2026-01-01T00:00:00.000Z", definitionId: definition.definitionId, instanceId: "cli-instance", nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "READY", stepId: "direction" }], stopReason: "NONE", updatedAt: "2026-01-01T00:00:00.000Z", version: 0 };
      const create = await runCli(configPath, JSON.stringify(workflowCommand("CREATE_WORKFLOW", { definition, instance })));
      expect(create.exitCode).toBe(0);
      expect(JSON.parse(create.stdout)).toMatchObject({ operation: "CREATE_WORKFLOW", result: { created: true }, status: "ok", unauthorizedExternalEffectOccurred: false });
      const replay = await runCli(configPath, JSON.stringify(workflowCommand("CREATE_WORKFLOW", { definition, instance })));
      expect(JSON.parse(replay.stdout)).toMatchObject({ replayed: true, result: { created: true }, status: "ok" });
      const report = await runCli(configPath, JSON.stringify(workflowCommand("GET_OPERATOR_REPORT", { contractVersion: "1", expectedVersion: 0, instanceId: "cli-instance", maxItems: 20 })));
      expect(report.exitCode).toBe(0);
      expect(JSON.parse(report.stdout)).toMatchObject({ nextAction: "Record the required operator_safety Guardian decision for step direction at Workflow version 0.", operation: "GET_OPERATOR_REPORT", result: { mission: { objective: definition.missionObjective }, overallStatus: "ACTIVE" }, status: "ok" });
    });
  });

  it("validates Mission commands and rejects arbitrary operation names", async () => {
    await withTemporaryDirectory(async (directory) => {
      const configPath = await writeConfig(directory, { databaseName: "mission-command.sqlite" });
      const mission = await runCli(configPath, JSON.stringify(workflowCommand("CREATE_MISSION", { brief: DEFAULT_FOUNDER_MISSION_BRIEF })));
      expect(mission.exitCode).toBe(0);
      expect(JSON.parse(mission.stdout)).toMatchObject({ operation: "CREATE_MISSION", status: "ok", unauthorizedExternalEffectOccurred: false });
      const unsafe = await runCli(configPath, JSON.stringify({ ...workflowCommand("CREATE_MISSION", { brief: DEFAULT_FOUNDER_MISSION_BRIEF }), operation: "CALL_INTERNAL_METHOD" }));
      expect(unsafe.exitCode).toBe(2);
      expect(JSON.parse(unsafe.stdout)).toMatchObject({ error: { code: "cli_request_invalid" }, status: "error" });
    });
  });

  it("rejects direct content review because the generic CLI cannot prove the Visual Gate binding", async () => {
    await withTemporaryDirectory(async (directory) => {
      const configPath = await writeConfig(directory, { databaseName: "visual-gate-bypass.sqlite" });
      const result = await runCli(configPath, JSON.stringify(workflowCommand("REVIEW_METODO_VELOCE_CONTENT", { decision: "APPROVED", expectedVersion: 0, note: "Tentativo diretto senza manifest e binding visuale.", productionId: "content-without-visual-gate" })));

      expect(result.exitCode).toBe(LOCAL_CLI_EXIT_CODE.executionFailure);
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { category: "authorization", code: "cli_visual_gate_required", stage: "workflow_command_visual_gate" }, status: "error" });
    });
  });

  it("executes a deterministic request and emits one JSON response", async () => {
    await withTemporaryDirectory(async (directory) => {
      const configPath = await writeConfig(directory);
      const result = await runCli(configPath, JSON.stringify(createRequest()));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        requestId: "request-001",
        status: "completed",
      });
    });
  });

  it("rejects invalid configuration before database creation", async () => {
    await withTemporaryDirectory(async (directory) => {
      const databasePath = join(directory, "must-not-exist.sqlite");
      const configPath = join(directory, "invalid.json");
      await writeFile(
        configPath,
        JSON.stringify({
          ...createCliConfig(databasePath),
          contractVersion: "2",
        }),
      );

      const result = await runCli(configPath, JSON.stringify(createRequest()));

      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({
        error: { code: "cli_configuration_invalid" },
        status: "error",
      });
      await expect(access(databasePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("rejects missing and oversized configuration safely", async () => {
    await withTemporaryDirectory(async (directory) => {
      const missing = await runCli(
        join(directory, "missing.json"),
        JSON.stringify(createRequest()),
      );
      expect(missing.exitCode).toBe(2);
      expect(JSON.parse(missing.stdout)).toMatchObject({
        error: { code: "cli_configuration_unavailable" },
        status: "error",
      });

      const oversizedPath = join(directory, "oversized-config.json");
      await writeFile(oversizedPath, "x".repeat(65_537));
      const oversized = await runCli(
        oversizedPath,
        JSON.stringify(createRequest()),
      );
      expect(oversized.exitCode).toBe(2);
      expect(JSON.parse(oversized.stdout)).toMatchObject({
        error: { code: "cli_configuration_too_large" },
        status: "error",
      });
    });
  });

  it("rejects malformed and oversized request input safely", async () => {
    await withTemporaryDirectory(async (directory) => {
      const malformedConfig = await writeConfig(directory, {
        databaseName: "malformed.sqlite",
      });
      const malformed = await runCli(malformedConfig, "{");

      expect(malformed.exitCode).toBe(2);
      expect(JSON.parse(malformed.stdout)).toMatchObject({
        error: { code: "cli_request_json_invalid" },
        status: "error",
      });

      const oversizedConfig = await writeConfig(directory, {
        databaseName: "oversized.sqlite",
        maxRequestBytes: 10,
      });
      const oversized = await runCli(
        oversizedConfig,
        JSON.stringify(createRequest()),
      );

      expect(oversized.exitCode).toBe(2);
      expect(JSON.parse(oversized.stdout)).toMatchObject({
        error: { code: "cli_request_too_large" },
        status: "error",
      });
    });
  });

  it("normalizes runtime creation failures without leaking paths", async () => {
    await withTemporaryDirectory(async (directory) => {
      const secretMarker = "private-runtime-marker";
      const configPath = join(directory, "runtime-failure.json");
      await writeFile(
        configPath,
        JSON.stringify(createCliConfig(join(directory, secretMarker))),
      );
      await mkdir(join(directory, secretMarker));

      const result = await runCli(configPath, JSON.stringify(createRequest()));

      expect(result.exitCode).toBe(3);
      expect(JSON.parse(result.stdout)).toMatchObject({
        error: {
          code: "sqlite_repository_failed",
          stage: "persistence",
        },
        status: "error",
      });
      expect(result.stdout).not.toContain(secretMarker);
    });
  });

  it("fails closed when request identity differs from configuration", async () => {
    await withTemporaryDirectory(async (directory) => {
      const configPath = await writeConfig(directory);
      const result = await runCli(
        configPath,
        JSON.stringify(createRequest({ actorId: "actor-other" })),
      );

      expect(result.exitCode).toBe(4);
      expect(JSON.parse(result.stdout)).toMatchObject({
        error: { code: "local_runtime_identity_mismatch" },
        status: "error",
      });
    });
  });

  it("replays the same durable response across separate invocations", async () => {
    await withTemporaryDirectory(async (directory) => {
      const configPath = await writeConfig(directory);
      const input = JSON.stringify(createRequest());

      const first = await runCli(configPath, input);
      const second = await runCli(configPath, input);

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toBe(first.stdout);
    });
  });

  it("terminates cleanly on SIGTERM while waiting for input", async () => {
    await withTemporaryDirectory(async (directory) => {
      const databasePath = join(directory, "runtime.sqlite");
      const configPath = await writeConfig(directory);
      const result = await runCliWithSignal(configPath, databasePath);

      expect(result).toEqual({
        exitCode: LOCAL_CLI_EXIT_CODE.terminated,
        stderr: "",
        stdout: "",
      });
    });
  });
});

function workflowCommand(operation: string, input: Readonly<Record<string, unknown>>) { return { actorId: "actor-local", commandId: `command-${operation.toLowerCase()}`, contractVersion: "1", input, operation, workspaceId: "workspace-local" }; }

class RecordingRuntime implements LocalRuntime {
  public closeCount = 0;

  public close(): Promise<void> {
    this.closeCount += 1;
    return Promise.resolve();
  }

  public execute(): Promise<TaskResponse> {
    return Promise.reject(new Error("Execution was not expected"));
  }
}

class ControllableInput implements AsyncIterable<Uint8Array> {
  #complete: (() => void) | undefined;

  public end(): void {
    this.#complete?.();
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    await new Promise<void>((resolveInput) => {
      this.#complete = resolveInput;
    });
  }
}

class RecordingHost implements LocalCliHost {
  public readonly arguments = ["--config", "/config.json"];
  public readonly input: AsyncIterable<Uint8Array>;
  public readonly runtimeCreated: Promise<void>;
  public readonly terminated: Promise<number>;
  readonly #config: Uint8Array;
  readonly #listeners = new Map<string, () => void>();
  readonly #runtime: LocalRuntime;
  #resolveRuntimeCreated: (() => void) | undefined;
  #resolveTerminated: ((exitCode: number) => void) | undefined;

  public constructor(
    runtime: LocalRuntime,
    input: AsyncIterable<Uint8Array>,
  ) {
    this.#runtime = runtime;
    this.input = input;
    this.#config = Buffer.from(
      JSON.stringify(createCliConfig("/runtime.sqlite")),
    );
    this.runtimeCreated = new Promise((resolveRuntimeCreated) => {
      this.#resolveRuntimeCreated = resolveRuntimeCreated;
    });
    this.terminated = new Promise((resolveTerminated) => {
      this.#resolveTerminated = resolveTerminated;
    });
  }

  public createRuntime(
    config: LocalRuntimeConfig,
  ): Promise<LocalRuntime> {
    void config;
    this.#resolveRuntimeCreated?.();
    return Promise.resolve(this.#runtime);
  }

  public onSignal(signal: string, listener: () => void): void {
    this.#listeners.set(signal, listener);
  }

  public readConfig(): Promise<Uint8Array> {
    return Promise.resolve(this.#config);
  }

  public removeSignalListener(signal: string): void {
    this.#listeners.delete(signal);
  }

  public signal(signal: "SIGINT" | "SIGTERM"): void {
    this.#listeners.get(signal)?.();
  }

  public terminate(exitCode: number): void {
    this.#resolveTerminated?.(exitCode);
  }

  public writeOutput(output: string): void {
    void output;
  }
}

interface CliProcessResult {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function runCli(configPath: string, input: string): Promise<CliProcessResult> {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(
      process.execPath,
      [cliPath, "--config", configPath],
      {
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stderr = "";
    let stdout = "";
    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", rejectProcess);
    child.once("close", (exitCode) => {
      resolveProcess({ exitCode, stderr, stdout });
    });
    child.stdin.end(input);
  });
}

async function runCliWithSignal(
  configPath: string,
  databasePath: string,
): Promise<CliProcessResult> {
  const child = spawn(
    process.execPath,
    [cliPath, "--config", configPath],
    {
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "";
  let stdout = "";
  child.stderr.setEncoding("utf8");
  child.stdout.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  await waitForFile(databasePath);
  child.kill("SIGTERM");

  return await new Promise((resolveProcess, rejectProcess) => {
    child.once("error", rejectProcess);
    child.once("close", (exitCode) => {
      resolveProcess({ exitCode, stderr, stdout });
    });
  });
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    }
  }
  throw new Error("CLI runtime did not create its database");
}

function createCliConfig(
  databasePath: string,
  maxRequestBytes = 65_536,
): LocalCliConfig {
  return {
    contractVersion: "1",
    maxRequestBytes,
    runtime: {
      actorId: "actor-local",
      contentAgentMode: "deterministic",
      contractVersion: "1",
      permissions: {
        actorGrants: [],
        policyGrants: [],
        taskGrants: [],
      },
      sqlite: {
        path: databasePath,
        timeoutMs: 1_000,
      },
      workspaceId: "workspace-local",
    },
  };
}

async function writeConfig(
  directory: string,
  options: {
    readonly databaseName?: string;
    readonly maxRequestBytes?: number;
  } = {},
): Promise<string> {
  const configPath = join(
    directory,
    `${options.databaseName ?? "runtime"}.json`,
  );
  await writeFile(
    configPath,
    JSON.stringify(
      createCliConfig(
        join(directory, options.databaseName ?? "runtime.sqlite"),
        options.maxRequestBytes,
      ),
    ),
  );
  return configPath;
}

async function withTemporaryDirectory(
  test: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-cli-"));
  try {
    await test(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
