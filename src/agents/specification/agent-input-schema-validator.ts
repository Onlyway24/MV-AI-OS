import type { AgentInputSchema } from "./agent-input-schema.js";
import { validateAgentSchema } from "./agent-schema-validation.js";
import type {
  ValidationResult,
  Validator,
} from "../../validation/validation.js";

export class AgentInputSchemaValidator
  implements Validator<AgentInputSchema>
{
  public validate(value: unknown): ValidationResult<AgentInputSchema> {
    return validateAgentSchema(value, "agent input schema");
  }
}
