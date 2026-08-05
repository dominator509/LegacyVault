import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPersistedWorkflowHandler,
  type PersistedWorkflowState,
  type WorkflowJobData,
  type WorkflowStateStore,
} from "../../apps/worker/src/index.js";

function fixture() {
  const data: WorkflowJobData = {
    workflowId: randomUUID(),
    organizationId: randomUUID(),
    householdId: randomUUID(),
    actorId: randomUUID(),
  };
  let state: PersistedWorkflowState = {
    id: data.workflowId,
    status: "pending",
    completedSteps: [],
    nextStep: "scan",
    version: 1,
  };
  let failure: string | undefined;
  const store: WorkflowStateStore = {
    async getWorkflow() {
      return state;
    },
    async completeStep(_data, input) {
      if (input.expectedVersion !== state.version)
        throw new Error("version conflict");
      state = {
        ...state,
        status: input.nextStep === null ? "completed" : "running",
        completedSteps: [...new Set([...state.completedSteps, input.step])],
        nextStep: input.nextStep,
        version: state.version + 1,
      };
      return state;
    },
    async recordFailure(_data, errorClass) {
      failure = errorClass;
      state = { ...state, status: "failed", version: state.version + 1 };
    },
  };
  return { data, store, state: () => state, failure: () => failure };
}

describe("persisted workflow handler", () => {
  it("persists each completed step and makes a completed redelivery a no-op", async () => {
    const subject = fixture();
    const calls: string[] = [];
    const handler = createPersistedWorkflowHandler(subject.store, [
      { name: "scan", execute: async () => void calls.push("scan") },
      { name: "ocr", execute: async () => void calls.push("ocr") },
    ]);
    await handler(subject.data);
    await handler(subject.data);
    expect(calls).toEqual(["scan", "ocr"]);
    expect(subject.state()).toMatchObject({
      status: "completed",
      completedSteps: ["scan", "ocr"],
      nextStep: null,
    });
  });

  it("records a content-free error class and resumes from the failed step", async () => {
    const subject = fixture();
    let attempts = 0;
    const handler = createPersistedWorkflowHandler(subject.store, [
      { name: "scan", execute: async () => undefined },
      {
        name: "ocr",
        execute: async () => {
          attempts += 1;
          if (attempts === 1) throw new TypeError("sensitive source detail");
        },
      },
    ]);
    await expect(handler(subject.data)).rejects.toThrow(TypeError);
    expect(subject.failure()).toBe("TypeError");
    expect(subject.state().completedSteps).toEqual(["scan"]);
    await handler(subject.data);
    expect(subject.state().status).toBe("completed");
    expect(attempts).toBe(2);
  });
});
