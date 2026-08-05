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
}
export type WorkflowHandler = (data: WorkflowJobData) => Promise<void>;

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
