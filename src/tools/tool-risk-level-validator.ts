import type { ToolRiskLevel } from "./tool-risk-level.js";
import {
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

const TOOL_RISK_LEVELS = new Set<ToolRiskLevel>([
  "high",
  "low",
  "medium",
]);

export class ToolRiskLevelValidator implements Validator<ToolRiskLevel> {
  public validate(value: unknown): ValidationResult<ToolRiskLevel> {
    if (
      typeof value !== "string" ||
      !TOOL_RISK_LEVELS.has(value as ToolRiskLevel)
    ) {
      return validationFailure([
        {
          code: typeof value === "string" ? "invalid_value" : "invalid_type",
          message: "tool risk level is not supported",
          path: "$",
        },
      ]);
    }
    return validationSuccess(value as ToolRiskLevel);
  }
}
