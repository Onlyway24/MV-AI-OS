import { describe, expect, it } from "vitest";

import { LocalRuntimeConfigValidator } from "../../src/runtime/local-runtime-config-validator.js";
import {
  evaluateProviderModePolicy,
  type LivePaidActivation,
} from "../../src/production/provider-mode.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");

describe("production provider modes", () => {
  it("defaults every existing deterministic config to OFFLINE_REHEARSAL", () => {
    const validation = new LocalRuntimeConfigValidator().validate({
      actorId: "actor-local",
      contentAgentMode: "deterministic",
      contractVersion: "1",
      permissions: {
        actorGrants: [],
        policyGrants: [],
        taskGrants: [],
      },
      sqlite: { path: "/tmp/provider-mode.sqlite", timeoutMs: 1_000 },
      workspaceId: "workspace-local",
    });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(evaluateProviderModePolicy({
      contentAgentMode: validation.value.contentAgentMode,
      now: NOW,
      workspaceId: validation.value.workspaceId,
    })).toMatchObject({
      mode: "OFFLINE_REHEARSAL",
      ready: true,
    });
  });

  it("fails closed for paid OpenAI unless a trusted rehearsal transport is injected", () => {
    const input = {
      contentAgentMode: "model-backed-openai" as const,
      modelProvider: {
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-5.5",
        providerId: "openai",
      },
      now: NOW,
      workspaceId: "workspace-local",
    };

    expect(evaluateProviderModePolicy(input)).toMatchObject({
      mode: "OFFLINE_REHEARSAL",
      paidCallsAllowed: false,
      ready: false,
      reasonCodes: ["PAID_PROVIDER_DISABLED"],
    });
    expect(evaluateProviderModePolicy({
      ...input,
      trustedOfflineTransportInstalled: true,
    })).toMatchObject({
      mode: "OFFLINE_REHEARSAL",
      paidCallsAllowed: false,
      ready: true,
    });
  });

  it("allows only loopback endpoints in LOCAL_PROVIDER_OPTIONAL", () => {
    const base = {
      contentAgentMode: "model-backed-openai" as const,
      now: NOW,
      providerMode: "LOCAL_PROVIDER_OPTIONAL" as const,
      workspaceId: "workspace-local",
    };
    expect(evaluateProviderModePolicy({
      ...base,
      modelProvider: {
        baseUrl: "https://api.openai.com/v1",
        modelId: "local-model",
        providerId: "openai",
      },
    })).toMatchObject({
      ready: false,
      reasonCodes: ["LOCAL_PROVIDER_ENDPOINT_REQUIRED"],
    });
    expect(evaluateProviderModePolicy({
      ...base,
      modelProvider: {
        baseUrl: "http://127.0.0.1:11434/v1",
        modelId: "local-model",
        providerId: "openai",
      },
    })).toMatchObject({ paidCallsAllowed: false, ready: true });
  });

  it("keeps LIVE_PAID closed without the trusted Cost Control boundary", () => {
    const activation: LivePaidActivation = {
      activationId: "activation-001",
      approvalReceiptId: "approval-001",
      approvedAt: "2026-07-26T11:00:00.000Z",
      approvedBy: "fabio",
      confirmedByFabio: true,
      contractVersion: "1",
      expiresAt: "2026-07-26T13:00:00.000Z",
      killSwitch: "RELEASED",
      maxCostUsd: 0.1,
      scope: "OPENAI_RESPONSES_PAID",
      workspaceId: "workspace-local",
    };
    const input = {
      contentAgentMode: "model-backed-openai" as const,
      livePaidActivation: activation,
      modelBudget: {
        contractVersion: "1" as const,
        required: true,
        rules: [{
          contractVersion: "1" as const,
          maxRequestedCostUsd: 0.05,
          modelId: "gpt-5.5",
          profileId: "content-quality",
          providerId: "openai",
          requireEstimatedCost: false,
          requireRequestCost: true,
        }],
      },
      modelOperationLimits: {
        contractVersion: "1" as const,
        maxCostUsd: 0.05,
        maxInputCharacters: 300_000,
        maxOutputTokens: 2_048,
        maxProviderCalls: 1,
        timeoutMs: 30_000,
      },
      modelProvider: {
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-5.5",
        providerId: "openai",
      },
      now: NOW,
      providerMode: "LIVE_PAID" as const,
      workspaceId: "workspace-local",
    };

    expect(evaluateProviderModePolicy(input)).toMatchObject({
      paidCallsAllowed: false,
      ready: false,
      reasonCodes: ["LIVE_COST_CONTROL_BOUNDARY_REQUIRED"],
    });
    expect(evaluateProviderModePolicy({
      ...input,
      trustedLiveCostControlBoundaryInstalled: true,
    })).toMatchObject({
      paidCallsAllowed: true,
      ready: true,
      reasonCodes: [],
    });
    expect(evaluateProviderModePolicy({
      ...input,
      now: new Date("2026-07-26T13:00:00.000Z"),
      trustedLiveCostControlBoundaryInstalled: true,
    })).toMatchObject({
      paidCallsAllowed: false,
      ready: false,
      reasonCodes: ["LIVE_ACTIVATION_EXPIRED"],
    });
  });
});
