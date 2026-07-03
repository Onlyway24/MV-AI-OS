import type { WorkflowInput } from "./workflow-input.js";
import { validateWorkflowSchema } from "./workflow-schema-validation.js";
import type {
  ValidationResult,
  Validator,
} from "../../validation/validation.js";

export class WorkflowInputValidator implements Validator<WorkflowInput> {
  public validate(value: unknown): ValidationResult<WorkflowInput> {
    return validateWorkflowSchema(value, "workflow input");
  }
}
