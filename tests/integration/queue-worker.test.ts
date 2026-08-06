import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createWorkflowQueue,
  createWorkflowQueueEvents,
  createWorkflowWorker,
  enqueueWorkflow,
  type WorkflowJobData,
} from "../../apps/worker/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();

describe("real Valkey workflow queue", () => {
  it("executes an idempotently keyed workflow through BullMQ", async () => {
    const queueName = `legacy-test-${randomUUID()}`;
    const received: WorkflowJobData[] = [];
    const handler = async (data: WorkflowJobData) => {
      received.push(data);
    };
    const handlers = {
      "document-process": handler,
      "report-generate": handler,
      "privacy-delete": handler,
      "privacy-export": handler,
      "annual-review": handler,
      "notification-send": handler,
    } as const;
    const queue = createWorkflowQueue(local.REDIS_URL ?? "", queueName);
    const queueEvents = createWorkflowQueueEvents(
      local.REDIS_URL ?? "",
      queueName,
    );
    const worker = createWorkflowWorker(
      local.REDIS_URL ?? "",
      handlers,
      queueName,
    );
    const workflowId = randomUUID();
    try {
      const data = {
        workflowId,
        organizationId: randomUUID(),
        householdId: randomUUID(),
        actorId: randomUUID(),
      };
      const job = await enqueueWorkflow(queue, "annual-review", data);
      const notification = await enqueueWorkflow(
        queue,
        "notification-send",
        data,
      );
      expect(notification.id).not.toBe(job.id);
      await queueEvents.waitUntilReady();
      await job.waitUntilFinished(queueEvents, 10_000);
      await notification.waitUntilFinished(queueEvents, 10_000);
      expect(received).toHaveLength(2);
      expect(received[0]?.workflowId).toBe(workflowId);
    } finally {
      await worker.close();
      await queueEvents.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
