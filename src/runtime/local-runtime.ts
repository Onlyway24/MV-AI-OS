import type { TaskResponse } from "../contracts/task-response.js";
import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { CoreBrain } from "../core/core-brain.js";
import { RequestValidationError } from "../errors/core-error.js";
import type { Validator } from "../validation/validation.js";
import type { ReferenceVaultCommand, ReferenceVaultCommandResponse } from "../reference-vault/reference-vault.js";
import type { ReferenceVaultCommandBoundary } from "../reference-vault/reference-vault-command-boundary.js";
import type { LocalWorkflowCommand, LocalWorkflowCommandBoundary, LocalWorkflowCommandResponse } from "./local-workflow-command.js";
import {
  LocalRuntimeIdentityError,
  LocalRuntimeStateError,
} from "./local-runtime-error.js";

export interface LocalRuntime {
  execute(request: unknown): Promise<TaskResponse>;
  executeReferenceVaultCommand?(command: ReferenceVaultCommand): Promise<ReferenceVaultCommandResponse>;
  executeWorkflowCommand?(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse>;
  close(): Promise<void>;
}

export interface LocalRuntimeResource {
  close(): Promise<void>;
}

export class ComposedLocalRuntime implements LocalRuntime {
  readonly #coreBrain: CoreBrain;
  readonly #inFlight = new Set<Promise<unknown>>();
  readonly #actorId: string;
  readonly #requestValidator: Validator<RequestEnvelope>;
  readonly #resources: readonly LocalRuntimeResource[];
  readonly #workspaceId: string;
  #acceptingRequests = true;
  #closePromise: Promise<void> | undefined;

  public constructor(
    coreBrain: CoreBrain,
    resources: readonly LocalRuntimeResource[],
    requestValidator: Validator<RequestEnvelope>,
    identity: {
      readonly actorId: string;
      readonly workspaceId: string;
    },
    private readonly workflowCommands?: LocalWorkflowCommandBoundary,
    private readonly referenceVaultCommands?: Pick<ReferenceVaultCommandBoundary, "execute">,
  ) {
    this.#actorId = identity.actorId;
    this.#coreBrain = coreBrain;
    this.#requestValidator = requestValidator;
    this.#resources = Object.freeze([...resources]);
    this.#workspaceId = identity.workspaceId;
  }

  public executeReferenceVaultCommand(command: ReferenceVaultCommand): Promise<ReferenceVaultCommandResponse> {
    if (!this.#acceptingRequests) return Promise.reject(new LocalRuntimeStateError());
    if (this.referenceVaultCommands === undefined) return Promise.reject(new LocalRuntimeStateError());
    const execution = this.referenceVaultCommands.execute(command);
    this.#inFlight.add(execution);
    execution.then(() => this.#inFlight.delete(execution), () => this.#inFlight.delete(execution));
    return execution;
  }

  public executeWorkflowCommand(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
    if (!this.#acceptingRequests) return Promise.reject(new LocalRuntimeStateError());
    if (this.workflowCommands === undefined) return Promise.reject(new LocalRuntimeStateError());
    const execution = this.workflowCommands.execute(command);
    this.#inFlight.add(execution);
    execution.then(() => this.#inFlight.delete(execution), () => this.#inFlight.delete(execution));
    return execution;
  }

  public execute(request: unknown): Promise<TaskResponse> {
    if (!this.#acceptingRequests) {
      return Promise.reject(new LocalRuntimeStateError());
    }

    const validation = this.#requestValidator.validate(request);
    if (!validation.ok) {
      return Promise.reject(new RequestValidationError(validation.issues));
    }
    if (
      validation.value.actorId !== this.#actorId ||
      validation.value.workspaceId !== this.#workspaceId
    ) {
      return Promise.reject(new LocalRuntimeIdentityError());
    }

    const execution = this.#coreBrain.execute(validation.value);
    this.#inFlight.add(execution);
    execution.then(
      () => this.#inFlight.delete(execution),
      () => this.#inFlight.delete(execution),
    );
    return execution;
  }

  public close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      return this.#closePromise;
    }

    this.#acceptingRequests = false;
    this.#closePromise = this.#close();
    return this.#closePromise;
  }

  async #close(): Promise<void> {
    await Promise.allSettled([...this.#inFlight]);
    let firstError: unknown;
    for (const resource of [...this.#resources].reverse()) {
      try {
        await resource.close();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) {
      throw firstError instanceof Error
        ? firstError
        : new Error("Local runtime shutdown failed", {
            cause: firstError,
          });
    }
  }
}
