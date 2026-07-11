import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { LocalWorkflowCommand } from "../runtime/local-workflow-command.js";
import { LocalWorkflowCommandValidator } from "../runtime/local-workflow-command.js";
import { RequestEnvelopeValidator } from "../validation/request-envelope-validator.js";
import type { ValidationResult, Validator } from "../validation/validation.js";

export type LocalCliInput = RequestEnvelope | LocalWorkflowCommand;

export class LocalCliInputValidator implements Validator<LocalCliInput> {
  readonly #request = new RequestEnvelopeValidator();
  readonly #workflow = new LocalWorkflowCommandValidator();
  public validate(value: unknown): ValidationResult<LocalCliInput> {
    const workflow = this.#workflow.validate(value);
    if (workflow.ok) return workflow;
    return this.#request.validate(value);
  }
}

export function isLocalWorkflowCommand(value: LocalCliInput): value is LocalWorkflowCommand { return "operation" in value; }
