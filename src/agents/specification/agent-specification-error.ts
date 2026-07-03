import type { JsonObject } from "../../contracts/json.js";
import { CoreError } from "../../errors/core-error.js";

export class AgentSpecificationRegistryError extends CoreError {
  public constructor(
    code:
      | "agent_specification_duplicate"
      | "agent_specification_invalid",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category:
        code === "agent_specification_duplicate"
          ? "conflict"
          : "validation",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "agent_specification_registry",
    });
  }
}
