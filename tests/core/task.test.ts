import { describe, expect, it } from "vitest";

import {
  TaskStateError,
  createTask,
  isTaskTransitionAllowed,
  transitionTask,
  type TaskState,
} from "../../src/index.js";
import { createRequest } from "../support/fixtures.js";

describe("Task model", () => {
  it("implements the documented preparation states", () => {
    const received = createTask(
      createRequest(),
      "task-001",
      "2026-07-02T10:00:01.000Z",
    );
    const validated = transitionTask(
      received,
      "validated",
      "2026-07-02T10:00:02.000Z",
    );
    const contextReady = transitionTask(
      validated,
      "context_ready",
      "2026-07-02T10:00:03.000Z",
    );

    expect(received.state).toBe("received");
    expect(validated.state).toBe("validated");
    expect(contextReady.state).toBe("context_ready");
    expect(received).not.toBe(validated);
  });

  it("rejects invalid transitions rather than coercing them", () => {
    const task = createTask(
      createRequest(),
      "task-001",
      "2026-07-02T10:00:01.000Z",
    );

    expect(() =>
      transitionTask(task, "completed", "2026-07-02T10:00:02.000Z"),
    ).toThrow(
      expect.objectContaining<Partial<TaskStateError>>({
        code: "task_transition_invalid",
      }),
    );
  });

  it("keeps terminal states terminal", () => {
    const terminalStates: readonly TaskState[] = [
      "cancelled",
      "completed",
      "failed",
    ];
    const allStates: readonly TaskState[] = [
      "awaiting_approval",
      "awaiting_input",
      "cancelled",
      "completed",
      "context_ready",
      "failed",
      "received",
      "routed",
      "running",
      "validated",
      "workflow_pending",
    ];

    for (const terminal of terminalStates) {
      for (const candidate of allStates) {
        expect(isTaskTransitionAllowed(terminal, candidate)).toBe(false);
      }
    }
  });

  it("matches the complete documented transition matrix", () => {
    const expected: Readonly<Record<TaskState, readonly TaskState[]>> = {
      awaiting_approval: [
        "workflow_pending",
        "completed",
        "failed",
        "cancelled",
      ],
      awaiting_input: ["validated", "failed", "cancelled"],
      cancelled: [],
      completed: [],
      context_ready: ["routed", "failed", "cancelled"],
      failed: [],
      received: ["validated", "failed", "cancelled"],
      routed: ["running", "failed", "cancelled"],
      running: [
        "awaiting_input",
        "awaiting_approval",
        "workflow_pending",
        "completed",
        "failed",
        "cancelled",
      ],
      validated: ["context_ready", "failed", "cancelled"],
      workflow_pending: ["completed", "failed", "cancelled"],
    };
    const states = Object.keys(expected) as TaskState[];

    for (const from of states) {
      for (const to of states) {
        expect(isTaskTransitionAllowed(from, to)).toBe(
          expected[from].includes(to),
        );
      }
    }
  });
});
