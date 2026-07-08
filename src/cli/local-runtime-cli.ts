#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { TaskResponse } from "../contracts/task-response.js";
import type { LocalRuntimeConfig } from "../runtime/local-runtime-config.js";
import { createLocalRuntime } from "../runtime/create-local-runtime.js";
import type { LocalRuntime } from "../runtime/local-runtime.js";
import { RequestEnvelopeValidator } from "../validation/request-envelope-validator.js";
import {
  CliBoundaryError,
  createCliErrorResponse,
  type CliErrorResponse,
} from "./cli-error-response.js";
import { CliRequestParser } from "./cli-request-parser.js";
import {
  MAX_LOCAL_CLI_CONFIG_BYTES,
  type LocalCliConfig,
} from "./local-cli-config.js";
import { LocalCliConfigValidator } from "./local-cli-config-validator.js";

export const LOCAL_CLI_EXIT_CODE = Object.freeze({
  executionFailure: 4,
  interrupted: 130,
  invalidInput: 2,
  runtimeCreationFailure: 3,
  success: 0,
  terminated: 143,
});

type CliExitCode =
  (typeof LOCAL_CLI_EXIT_CODE)[keyof typeof LOCAL_CLI_EXIT_CODE];
type CliSignal = "SIGINT" | "SIGTERM";

export interface LocalCliHost {
  readonly arguments: readonly string[];
  readonly input: AsyncIterable<Uint8Array | string>;
  createRuntime(config: LocalRuntimeConfig): Promise<LocalRuntime>;
  onSignal(signal: CliSignal, listener: () => void): void;
  readConfig(path: string, maximumBytes: number): Promise<Uint8Array>;
  removeSignalListener(signal: CliSignal, listener: () => void): void;
  terminate(exitCode: number): void;
  writeOutput(output: string): void;
}

export async function runLocalRuntimeCli(
  host: LocalCliHost,
): Promise<CliExitCode> {
  let runtime: LocalRuntime | undefined;
  let runtimeCreation: Promise<LocalRuntime> | undefined;
  let closePromise: Promise<void> | undefined;
  let exitCode: CliExitCode = LOCAL_CLI_EXIT_CODE.invalidInput;
  let output: TaskResponse | CliErrorResponse;

  const closeRuntime = (): Promise<void> => {
    closePromise ??=
      runtime?.close() ??
      runtimeCreation?.then(
        (createdRuntime) => createdRuntime.close(),
        () => undefined,
      ) ??
      Promise.resolve();
    return closePromise;
  };
  const interrupt = (exitCode: CliExitCode): void => {
    void closeRuntime().finally(() => {
      host.terminate(exitCode);
    });
  };
  const onInterrupt = (): void => {
    interrupt(LOCAL_CLI_EXIT_CODE.interrupted);
  };
  const onTerminate = (): void => {
    interrupt(LOCAL_CLI_EXIT_CODE.terminated);
  };

  host.onSignal("SIGINT", onInterrupt);
  host.onSignal("SIGTERM", onTerminate);

  try {
    const configPath = parseArguments(host.arguments);
    const configBytes = await host.readConfig(
      configPath,
      MAX_LOCAL_CLI_CONFIG_BYTES,
    );
    const config = parseConfiguration(configBytes);

    exitCode = LOCAL_CLI_EXIT_CODE.runtimeCreationFailure;
    runtimeCreation = host.createRuntime(config.runtime);
    runtime = await runtimeCreation;

    exitCode = LOCAL_CLI_EXIT_CODE.invalidInput;
    const requestBytes = await readBoundedInput(
      host.input,
      config.maxRequestBytes,
    );
    const request = new CliRequestParser(
      new RequestEnvelopeValidator(),
    ).parse(requestBytes, config.maxRequestBytes);

    exitCode = LOCAL_CLI_EXIT_CODE.executionFailure;
    output = await runtime.execute(request);
    exitCode = LOCAL_CLI_EXIT_CODE.success;
  } catch (error) {
    output = createCliErrorResponse(error);
  } finally {
    host.removeSignalListener("SIGINT", onInterrupt);
    host.removeSignalListener("SIGTERM", onTerminate);
    try {
      await closeRuntime();
    } catch {
      if (exitCode === LOCAL_CLI_EXIT_CODE.success) {
        output = createCliErrorResponse(
          new CliBoundaryError(
            "cli_runtime_cleanup_failed",
            "The local runtime could not be closed cleanly",
            "cli_runtime_cleanup",
            "internal",
          ),
        );
        exitCode = LOCAL_CLI_EXIT_CODE.executionFailure;
      }
    }
  }
  writeJson(host, output);
  return exitCode;
}

function parseArguments(arguments_: readonly string[]): string {
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== "--config" ||
    arguments_[1] === undefined ||
    arguments_[1].trim().length === 0
  ) {
    throw new CliBoundaryError(
      "cli_arguments_invalid",
      "Usage: mv-ai-os --config <path>",
      "cli_arguments",
    );
  }
  return arguments_[1];
}

function parseConfiguration(input: Uint8Array): LocalCliConfig {
  let candidate: unknown;
  try {
    candidate = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(input),
    ) as unknown;
  } catch {
    throw new CliBoundaryError(
      "cli_configuration_json_invalid",
      "The CLI configuration must be valid UTF-8 JSON",
      "cli_configuration",
    );
  }

  const validation = new LocalCliConfigValidator().validate(candidate);
  if (!validation.ok) {
    throw new CliBoundaryError(
      "cli_configuration_invalid",
      "The CLI configuration is invalid",
      "cli_configuration",
    );
  }
  return validation.value;
}

async function readBoundedInput(
  input: AsyncIterable<Uint8Array | string>,
  maximumBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of input) {
    const bytes =
      typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maximumBytes) {
      throw new CliBoundaryError(
        "cli_request_too_large",
        "The request exceeds the configured size limit",
        "cli_request_input",
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, totalBytes);
}

function writeJson(
  host: LocalCliHost,
  value: TaskResponse | CliErrorResponse,
): void {
  host.writeOutput(`${JSON.stringify(value)}\n`);
}

async function readBoundedFile(
  path: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(maximumBytes + 1);
    const { bytesRead } = await handle.read(
      buffer,
      0,
      buffer.byteLength,
      0,
    );
    if (bytesRead > maximumBytes) {
      throw new CliBoundaryError(
        "cli_configuration_too_large",
        "The CLI configuration exceeds the size limit",
        "cli_configuration",
      );
    }
    return buffer.subarray(0, bytesRead);
  } catch (error) {
    if (error instanceof CliBoundaryError) {
      throw error;
    }
    throw new CliBoundaryError(
      "cli_configuration_unavailable",
      "The CLI configuration could not be read",
      "cli_configuration",
    );
  } finally {
    await handle?.close();
  }
}

function createProcessHost(): LocalCliHost {
  return {
    arguments: process.argv.slice(2),
    createRuntime: (config) => createLocalRuntime(config),
    input: process.stdin,
    onSignal: (signal, listener) => process.on(signal, listener),
    readConfig: readBoundedFile,
    removeSignalListener: (signal, listener) =>
      process.off(signal, listener),
    terminate: (exitCode) => process.exit(exitCode),
    writeOutput: (output) => {
      process.stdout.write(output);
    },
  };
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined &&
    realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(resolve(entryPath))
  );
}

if (isMainModule()) {
  const exitCode = await runLocalRuntimeCli(createProcessHost());
  process.exitCode = exitCode;
}
