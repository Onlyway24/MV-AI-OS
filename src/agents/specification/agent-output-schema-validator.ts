import type { AgentOutputSchema } from "./agent-output-schema.js";
import { validateAgentSchema } from "./agent-schema-validation.js";
import type {
  ValidationResult,
  Validator,
} from "../../validation/validation.js";

export class AgentOutputSchemaValidator
  implements Validator<AgentOutputSchema>
{
  public validate(value: unknown): ValidationResult<AgentOutputSchema> {
    return validateAgentSchema(value, "agent output schema");
  }
}
