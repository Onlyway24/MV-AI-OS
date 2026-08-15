import { createHash } from "node:crypto";

import type { LlmGateway } from "../models/llm-gateway.js";
import type { ModelRequest } from "../models/model-request.js";
import type { ModelResponse } from "../models/model-response.js";
import type { Clock } from "../ports/clock.js";
import {
  costApprovalFingerprint,
  type FabioCostApproval,
  type ProductionCostControl,
} from "./production-cost-control.js";

export class CostControlledLlmGateway implements LlmGateway {
  public constructor(
    private readonly input: Readonly<{
      readonly agentId: string;
      readonly approval: Omit<FabioCostApproval, "commandFingerprint" | "maxCostCents">;
      readonly clock: Clock;
      readonly costControl: ProductionCostControl;
      readonly gateway: LlmGateway;
      readonly maxCostUsd: number;
      readonly maxOutputTokens: number;
      readonly modelId: string;
      readonly providerId: string;
    }>,
  ) {}

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const requestCostUsd = request.limits.maxCostUsd;
    const estimatedCostUsd = requestCostUsd === undefined
      ? undefined
      : Math.min(requestCostUsd, this.input.maxCostUsd);
    if (
      estimatedCostUsd === undefined ||
      !Number.isFinite(estimatedCostUsd) ||
      estimatedCostUsd <= 0
    ) {
      return this.#failure(request, "model_cost_reservation_invalid");
    }
    const estimatedCostCents = Math.ceil(estimatedCostUsd * 100);
    const boundedRequest: ModelRequest = Object.freeze({
      ...request,
      limits: Object.freeze({
        ...request.limits,
        maxCostUsd: estimatedCostUsd,
        maxOutputTokens: Math.min(
          request.limits.maxOutputTokens,
          this.input.maxOutputTokens,
        ),
      }),
    });
    const unsignedReservation = Object.freeze({
      agentId: stableIdentifier("agent", this.input.agentId),
      estimatedCostCents,
      estimatedProviderCalls: 1,
      invocationId: stableIdentifier("invocation", request.invocationId),
      missionId: stableIdentifier("mission", request.correlationId),
      modelId: stableIdentifier("model", this.input.modelId),
      providerId: stableIdentifier("provider", this.input.providerId),
      reservationId: `cost-${fingerprint([
        request.modelRequestId,
        request.invocationId,
        request.taskId,
      ])}`,
      workflowId: stableIdentifier("workflow", request.taskId),
    });
    const reservation = await this.input.costControl.reserve({
      ...unsignedReservation,
      approval: {
        ...this.input.approval,
        commandFingerprint: costApprovalFingerprint(unsignedReservation),
        maxCostCents: estimatedCostCents,
      },
    });
    if (reservation.status !== "RESERVED") {
      return this.#failure(request, "model_paid_invocation_already_reserved");
    }

    let response: ModelResponse;
    try {
      response = await this.input.gateway.generate(boundedRequest);
    } catch (error) {
      await this.input.costControl.settle({
        actualCostCents: estimatedCostCents,
        actualCostUsd: estimatedCostUsd,
        actualProviderCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
        providerReceiptRef: stableIdentifier("provider-receipt", request.modelRequestId),
        reservationId: unsignedReservation.reservationId,
        totalTokens: 0,
      });
      await this.input.costControl.activateKillSwitch();
      throw error;
    }

    const providerCall = providerWasCalled(response);
    const actualCostUsd = response.usage?.costUsd ??
      (providerCall ? estimatedCostUsd : 0);
    const settlement = await this.input.costControl.settle({
      actualCostCents: Math.ceil(actualCostUsd * 100),
      actualCostUsd,
      actualProviderCalls: providerCall ? 1 : 0,
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      providerReceiptRef: stableIdentifier("provider-receipt", request.modelRequestId),
      reservationId: unsignedReservation.reservationId,
      totalTokens: response.usage?.totalTokens ?? 0,
    });
    return settlement.status === "SETTLED"
      ? response
      : this.#failure(request, "model_cost_settlement_anomaly");
  }

  #failure(request: ModelRequest, code: string): ModelResponse {
    const occurredAt = this.input.clock.now().toISOString();
    return {
      completedAt: occurredAt,
      contractVersion: "1",
      error: {
        category: "validation",
        code,
        message: "The paid model invocation was blocked by production Cost Control",
        occurredAt,
        retryable: false,
        stage: "cost_control",
      },
      modelRequestId: request.modelRequestId,
      provider: {
        modelId: this.input.modelId,
        providerId: this.input.providerId,
      },
      status: "failed",
    };
  }
}

function providerWasCalled(response: ModelResponse): boolean {
  return response.status === "succeeded" ||
    response.usage !== undefined ||
    response.error.stage === "provider_invocation" ||
    response.error.stage === "openai_response";
}

function stableIdentifier(prefix: string, value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)
    ? value
    : `${prefix}-${fingerprint([value])}`;
}

function fingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}
