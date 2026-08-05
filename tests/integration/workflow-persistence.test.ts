import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import {
  VaultRepository,
  type TenantContext,
} from "../../packages/database/src/repository.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const identity: TenantContext = {
  organizationId: randomUUID(),
  householdId: randomUUID(),
  actorId: randomUUID(),
};
const repository = new VaultRepository(databaseUrl);

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id', $1, true)", [
      identity.organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      identity.organizationId,
      "Workflow Test Organization",
    ]);
    await client.query("select set_config('app.household_id', $1, true)", [
      identity.householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [
        identity.householdId,
        identity.organizationId,
        "Workflow Test Household",
      ],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
});

afterAll(async () => repository.close());

describe("real persisted workflow recovery", () => {
  it("advances optimistically, records failure class, and completes without duplicate steps", async () => {
    const created = await repository.beginWorkflow(identity, {
      kind: "document-processing",
      idempotencyKey: `workflow-${randomUUID()}`,
      firstStep: "scan",
    });
    const first = await repository.completeWorkflowStep(identity, {
      workflowId: created.id,
      expectedVersion: created.version,
      step: "scan",
      nextStep: "ocr",
    });
    expect(first).toMatchObject({
      status: "running",
      completedSteps: ["scan"],
      nextStep: "ocr",
      version: 2,
    });
    await expect(
      repository.completeWorkflowStep(identity, {
        workflowId: created.id,
        expectedVersion: 1,
        step: "scan",
        nextStep: "ocr",
      }),
    ).rejects.toThrow(/version conflict/);
    await repository.recordWorkflowFailure(identity, created.id, "OcrTimeout");
    const failed = await repository.getWorkflow(identity, created.id);
    expect(failed).toMatchObject({
      status: "failed",
      nextStep: "ocr",
      version: 3,
    });
    const completed = await repository.completeWorkflowStep(identity, {
      workflowId: created.id,
      expectedVersion: failed.version,
      step: "ocr",
      nextStep: null,
    });
    expect(completed).toMatchObject({
      status: "completed",
      completedSteps: ["scan", "ocr"],
      nextStep: null,
      version: 4,
    });
  });
});
