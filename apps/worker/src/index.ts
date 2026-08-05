import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";

export type WorkflowJobName =
  | "document-process"
  | "report-generate"
  | "privacy-delete"
  | "annual-review"
  | "notification-send";
export interface WorkflowJobData {
  workflowId: string;
  organizationId: string;
  householdId: string;
  actorId: string;
}
export type WorkflowHandler = (data: WorkflowJobData) => Promise<void>;

export interface PersistedWorkflowState {
  id: string;
  status: string;
  completedSteps: string[];
  nextStep: string | null;
  version: number;
}

export interface WorkflowStateStore {
  getWorkflow(data: WorkflowJobData): Promise<PersistedWorkflowState>;
  completeStep(
    data: WorkflowJobData,
    input: { expectedVersion: number; step: string; nextStep: string | null },
  ): Promise<PersistedWorkflowState>;
  recordFailure(data: WorkflowJobData, errorClass: string): Promise<void>;
}

export interface WorkflowStep {
  name: string;
  execute(data: WorkflowJobData): Promise<void>;
}

export function createPersistedWorkflowHandler(
  store: WorkflowStateStore,
  steps: readonly WorkflowStep[],
): WorkflowHandler {
  if (
    steps.length === 0 ||
    new Set(steps.map(({ name }) => name)).size !== steps.length
  )
    throw new Error("workflow steps must be non-empty and uniquely named");
  return async (data) => {
    try {
      let workflow = await store.getWorkflow(data);
      if (workflow.status === "completed") return;
      for (const [index, step] of steps.entries()) {
        if (workflow.completedSteps.includes(step.name)) continue;
        if (workflow.nextStep !== null && workflow.nextStep !== step.name)
          throw new Error(
            "persisted workflow next step does not match its definition",
          );
        await step.execute(data);
        workflow = await store.completeStep(data, {
          expectedVersion: workflow.version,
          step: step.name,
          nextStep: steps[index + 1]?.name ?? null,
        });
      }
    } catch (error) {
      const errorClass = error instanceof Error ? error.name : "UnknownError";
      await store.recordFailure(data, errorClass);
      throw error;
    }
  };
}

function connection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10_000,
  });
}

export function createWorkflowQueueEvents(
  redisUrl: string,
  queueName = "legacy-workflows",
) {
  return new QueueEvents(queueName, { connection: connection(redisUrl) });
}

export function createWorkflowQueue(
  redisUrl: string,
  queueName = "legacy-workflows",
) {
  return new Queue<WorkflowJobData, void, WorkflowJobName>(queueName, {
    connection: connection(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 5_000 },
    },
  });
}

export function enqueueWorkflow(
  queue: Queue<WorkflowJobData, void, WorkflowJobName>,
  name: WorkflowJobName,
  data: WorkflowJobData,
  options: JobsOptions = {},
) {
  return queue.add(name, data, { ...options, jobId: data.workflowId });
}

export function createWorkflowWorker(
  redisUrl: string,
  handlers: Readonly<Record<WorkflowJobName, WorkflowHandler>>,
  queueName = "legacy-workflows",
) {
  const worker = new Worker<WorkflowJobData, void, WorkflowJobName>(
    queueName,
    async (job) => handlers[job.name](job.data),
    { connection: connection(redisUrl), concurrency: 10, lockDuration: 30_000 },
  );
  worker.on("failed", (job, error) => {
    process.stderr.write(
      JSON.stringify({
        service: "worker",
        action: job?.name ?? "unknown",
        outcome: "failed",
        error_class: error.name,
        workflow_id: job?.data.workflowId ?? "unknown",
      }) + "\n",
    );
  });
  return worker;
}
