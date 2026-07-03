import type { JsonObject } from "../../contracts/json.js";
import { CoreError } from "../../errors/core-error.js";

export class WorkflowSpecificationRegistryError extends CoreError {
  public constructor(
    code:
      | "workflow_specification_duplicate"
      | "workflow_specification_invalid",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category:
        code === "workflow_specification_duplicate"
          ? "conflict"
          : "validation",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "workflow_specification_registry",
    });
  }
}
