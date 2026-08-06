import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PostgresAuditStore } from "@legacy/audit";
import {
  AuthorizationDeniedError,
  createLegacyAuth,
  MembershipIdentityStore,
  requireIdentityAuthorization,
  resolveRequestIdentity,
} from "@legacy/auth";
import type { Environment } from "@legacy/contracts/environment";
import {
  decryptEnvelope,
  encryptEnvelope,
  PostgresHouseholdKeyStore,
  type EncryptedEnvelope,
} from "@legacy/crypto";
import { VaultRepository } from "@legacy/database/repository";
import {
  AiPolicyGateway,
  createDeepSeekRuntime,
  scanDlp,
  stableStringify,
  z,
} from "@legacy/ai-gateway";
import { createWorkflowQueue, enqueueWorkflow } from "@legacy/worker";
import {
  allRecordCategories,
  assertReportProvenance,
  recordCategoryFromFieldKey,
  type Report,
} from "@legacy/domain";
import { DocumentObjectStore } from "@legacy/documents";
import {
  LocalSmtpCaptureAdapter,
  ResendEmailAdapter,
} from "./adapters/email.js";
import { StripeAdapter } from "./adapters/stripe.js";
import type { ServerDependencies } from "./server.js";

function address(value: string): string {
  return /<([^>]+)>/u.exec(value)?.[1] ?? value;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function storedEnvelope(value: unknown): EncryptedEnvelope {
  if (!value || typeof value !== "object")
    throw new Error("encrypted envelope is invalid");
  const envelope = value as Partial<EncryptedEnvelope>;
  if (
    envelope.algorithm !== "A256GCM" ||
    !Number.isSafeInteger(envelope.keyVersion) ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.authenticationTag !== "string"
  )
    throw new Error("encrypted envelope is invalid");
  return envelope as EncryptedEnvelope;
}

const aiInterviewSchema = z.object({
  candidates: z
    .array(
      z.object({
        fieldKey: z.string().min(3).max(160),
        proposedValue: z.unknown(),
        evidenceQuote: z.string().min(1).max(500),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
  followUpQuestion: z.string().min(1).max(500).nullable(),
});

export function createApplicationRuntime(environment: Environment): {
  dependencies: ServerDependencies;
  close(): Promise<void>;
} {
  if (
    !environment.DATABASE_URL ||
    !environment.SESSION_SECRET ||
    !environment.AUDIT_HMAC_KEY ||
    !environment.APP_ENCRYPTION_KEK ||
    !environment.EXPORT_SIGNING_KEY ||
    !environment.REDIS_URL ||
    !environment.API_BASE_URL ||
    !environment.APP_BASE_URL ||
    !environment.EMAIL_FROM ||
    !environment.R2_ACCESS_KEY_ID ||
    !environment.R2_SECRET_ACCESS_KEY ||
    !environment.R2_BUCKET ||
    !environment.R2_ENDPOINT
  )
    throw new Error("application runtime configuration is incomplete");
  const repository = new VaultRepository(environment.DATABASE_URL);
  const identityStore = new MembershipIdentityStore(environment.DATABASE_URL);
  const auditKey = Buffer.from(environment.AUDIT_HMAC_KEY, "base64");
  if (auditKey.byteLength < 32) throw new Error("audit HMAC key is invalid");
  const auditStore = new PostgresAuditStore(environment.DATABASE_URL, auditKey);
  const applicationKek = Buffer.from(environment.APP_ENCRYPTION_KEK, "base64");
  if (applicationKek.byteLength !== 32)
    throw new Error("application encryption KEK is invalid");
  const workflowQueue = createWorkflowQueue(
    environment.REDIS_URL,
    environment.WORKFLOW_QUEUE_NAME,
  );
  const householdKeyStore = new PostgresHouseholdKeyStore(
    environment.DATABASE_URL,
    applicationKek,
  );
  const documentObjectStore = new DocumentObjectStore({
    endpoint: environment.R2_ENDPOINT,
    region: "auto",
    bucket: environment.R2_BUCKET,
    accessKeyId: environment.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    forcePathStyle: environment.LOCAL_ENGINEERING_MODE,
    allowBucketCreation: environment.LOCAL_ENGINEERING_MODE,
  });
  const email = environment.LOCAL_ENGINEERING_MODE
    ? new LocalSmtpCaptureAdapter({
        host: "127.0.0.1",
        port: 1025,
        from: address(environment.EMAIL_FROM),
        timeoutMs: 5_000,
      })
    : new ResendEmailAdapter({
        ...(environment.RESEND_API_KEY
          ? { apiKey: environment.RESEND_API_KEY }
          : {}),
        from: environment.EMAIL_FROM,
        timeoutMs: 10_000,
      });
  const sendAuthEmail = async (input: {
    kind: "verify" | "reset";
    to: string;
    url: string;
  }) => {
    const action = input.kind === "verify" ? "Verify email" : "Reset password";
    const escapedUrl = htmlEscape(input.url);
    await email.send({
      to: input.to,
      subject: `${action} for Legacy Vault`,
      text: `${action}: ${input.url}\nThis link expires in 30 minutes.`,
      html: `<p>${action}:</p><p><a href="${escapedUrl}">${action}</a></p><p>This link expires in 30 minutes.</p>`,
      idempotencyKey: createHash("sha256")
        .update(`${input.kind}:${input.to}:${input.url}`)
        .digest("hex"),
    });
  };
  const authRuntime = createLegacyAuth({
    databaseUrl: environment.DATABASE_URL,
    secret: environment.SESSION_SECRET,
    baseUrl: environment.API_BASE_URL,
    trustedOrigins: [environment.APP_BASE_URL],
    relyingPartyId: new URL(environment.APP_BASE_URL).hostname,
    production: environment.NODE_ENV === "production",
    sendVerificationEmail: async ({ email: to, url }) =>
      sendAuthEmail({ kind: "verify", to, url }),
    sendPasswordResetEmail: async ({ email: to, url }) =>
      sendAuthEmail({ kind: "reset", to, url }),
  });
  const stripe = new StripeAdapter({
    ...(environment.STRIPE_SECRET_KEY
      ? { secretKey: environment.STRIPE_SECRET_KEY }
      : {}),
    ...(environment.STRIPE_WEBHOOK_SECRET
      ? { webhookSecret: environment.STRIPE_WEBHOOK_SECRET }
      : {}),
    ...(environment.STRIPE_PRICE_ESSENTIAL
      ? { essentialPriceId: environment.STRIPE_PRICE_ESSENTIAL }
      : {}),
    timeoutMs: 10_000,
  });
  const deepSeekRuntime = createDeepSeekRuntime(environment);
  const deepSeek = deepSeekRuntime.provider;
  const aiMetrics: unknown[] = [];
  const aiGateway = new AiPolicyGateway(deepSeek, (metric) => {
    aiMetrics.push(metric);
    if (aiMetrics.length > 1_000) aiMetrics.shift();
  });
  const aiExactCache = new Map<string, unknown>();
  const aiIdempotencyCache = new Map<
    string,
    { requestHash: string; response: unknown }
  >();
  return {
    dependencies: {
      repository,
      stripe,
      auth: authRuntime.auth,
      authBaseUrl: environment.API_BASE_URL,
      resolveIdentity: (request) =>
        resolveRequestIdentity(
          { getSession: (input) => authRuntime.auth.api.getSession(input) },
          identityStore,
          request.headers,
        ),
      authorizeIdentity: async (identity, scope) => {
        try {
          requireIdentityAuthorization(identity, scope);
          await auditStore.append(identity, {
            id: randomUUID(),
            occurredAt: new Date().toISOString(),
            actorId: identity.actorId,
            action: scope.purpose,
            outcome: "allowed",
            metadata: {
              category: scope.category,
              permission_action: scope.action,
            },
          });
        } catch (error) {
          if (error instanceof AuthorizationDeniedError)
            await auditStore.append(identity, {
              id: randomUUID(),
              occurredAt: new Date().toISOString(),
              actorId: identity.actorId,
              action: scope.purpose,
              outcome: "denied",
              metadata: {
                category: scope.category,
                permission_action: scope.action,
                decision_reason: error.reason,
              },
            });
          throw error;
        }
      },
      startPortableExport: async (identity, input) => {
        const fingerprint = createHash("sha256")
          .update(input.exportKey)
          .digest("hex");
        const started = await repository.startPortableExport(identity, {
          idempotencyKey: input.idempotencyKey,
          exportKeyFingerprint: fingerprint,
          wrappedExportKey: encryptEnvelope(input.exportKey, applicationKek, {
            organizationId: identity.organizationId,
            householdId: identity.householdId,
            recordId: identity.householdId,
            purpose: "portable-export-key",
            keyVersion: 1,
          }),
          encryptionKeyVersion: 1,
          requestedAt: new Date().toISOString(),
        });
        await enqueueWorkflow(workflowQueue, "privacy-export", {
          workflowId: started.workflow.id,
          organizationId: identity.organizationId,
          householdId: identity.householdId,
          actorId: identity.actorId,
        });
        return started;
      },
      confirmPrivacyDeletion: async (identity, input) => {
        const recoveryDays = environment.DELETION_RECOVERY_DAYS ?? 30;
        const started = await repository.confirmPrivacyDeletion(identity, {
          ...input,
          confirmedAt: new Date().toISOString(),
          recoveryDays,
        });
        await enqueueWorkflow(
          workflowQueue,
          "privacy-delete",
          {
            workflowId: started.workflow.id,
            organizationId: identity.organizationId,
            householdId: identity.householdId,
            actorId: identity.actorId,
          },
          {
            delay: Math.max(
              0,
              Date.parse(started.privacyRequest.recoveryUntil) - Date.now(),
            ),
          },
        );
        return started;
      },
      cancelPrivacyDeletion: async (identity, input) => {
        const cancelled = await repository.cancelPrivacyDeletion(
          identity,
          input,
        );
        const job = await workflowQueue.getJob(cancelled.workflow.id);
        if (job) await job.remove();
        return cancelled;
      },
      encryptFactValue: async (identity, input) => {
        const id = randomUUID();
        const key = await householdKeyStore.getOrCreateActiveKey(identity);
        try {
          const envelope = encryptEnvelope(input.plaintext, key.plaintextKey, {
            organizationId: identity.organizationId,
            householdId: identity.householdId,
            recordId: id,
            purpose: `fact-value:${input.fieldKey}`,
            keyVersion: key.keyVersion,
          });
          return {
            id,
            ciphertext: Buffer.from(JSON.stringify(envelope), "utf8"),
            keyVersion: key.keyVersion,
          };
        } finally {
          key.plaintextKey.fill(0);
        }
      },
      createReport: async (identity, kind, idempotencyKey) => {
        const started = await repository.startReport(identity, {
          idempotencyKey,
          kind,
          requestedAt: new Date().toISOString(),
        });
        await enqueueWorkflow(
          workflowQueue,
          kind === "annual-review" ? "annual-review" : "report-generate",
          {
            workflowId: started.workflow.id,
            organizationId: identity.organizationId,
            householdId: identity.householdId,
            actorId: identity.actorId,
          },
        );
        return started;
      },
      getReport: async (identity, reportId) => {
        const record = await repository.getReport(identity, reportId);
        if (!record) return null;
        if (record.status !== "completed")
          return {
            id: record.id,
            kind: record.kind,
            status: record.status,
            generatedAt: record.generatedAt,
            version: record.version,
          };
        if (!record.payloadEncrypted || !record.encryptionKeyVersion)
          throw new Error("completed report payload is unavailable");
        const householdKey =
          await householdKeyStore.getOrCreateActiveKey(identity);
        let opened: Uint8Array | undefined;
        try {
          opened = decryptEnvelope(
            JSON.parse(
              Buffer.from(record.payloadEncrypted).toString("utf8"),
            ) as EncryptedEnvelope,
            householdKey.plaintextKey,
            {
              organizationId: identity.organizationId,
              householdId: identity.householdId,
              recordId: record.id,
              purpose: `report-payload:${record.kind}`,
              keyVersion: record.encryptionKeyVersion,
            },
          );
          const report = JSON.parse(
            Buffer.from(opened).toString("utf8"),
          ) as Report;
          if (
            report.id !== record.id ||
            report.organizationId !== identity.organizationId ||
            report.householdId !== identity.householdId ||
            report.kind !== record.kind
          )
            throw new Error("report payload binding mismatch");
          assertReportProvenance(report);
          return report;
        } finally {
          opened?.fill(0);
          record.payloadEncrypted.fill(0);
          householdKey.plaintextKey.fill(0);
        }
      },
      createCheckout: (identity, idempotencyKey) =>
        stripe.createCheckout({
          clientReferenceId: identity.membershipId,
          successUrl: new URL(
            "/billing/success",
            environment.APP_BASE_URL,
          ).toString(),
          cancelUrl: new URL(
            "/billing/cancel",
            environment.APP_BASE_URL,
          ).toString(),
          idempotencyKey,
          organizationId: identity.organizationId,
          householdId: identity.householdId,
          plan: "essential",
        }),
      startDocumentUpload: async (identity, input) => {
        const id = randomUUID();
        const dataKey = randomBytes(32);
        const householdKey =
          await householdKeyStore.getOrCreateActiveKey(identity);
        try {
          const record = await repository.startDocumentUpload(identity, {
            id,
            objectKey: documentObjectStore.createObjectKey(),
            originalSha256: input.originalSha256,
            mediaType: input.mediaType,
            wrappedDataKey: encryptEnvelope(
              dataKey,
              householdKey.plaintextKey,
              {
                organizationId: identity.organizationId,
                householdId: identity.householdId,
                recordId: id,
                purpose: "document-data-key",
                keyVersion: householdKey.keyVersion,
              },
            ),
            encryptionKeyVersion: householdKey.keyVersion,
            maximumBytes: input.maximumBytes,
            idempotencyKey: input.idempotencyKey,
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          });
          const returnedKey =
            record.id === id
              ? dataKey
              : decryptEnvelope(
                  storedEnvelope(record.wrappedDataKey),
                  householdKey.plaintextKey,
                  {
                    organizationId: identity.organizationId,
                    householdId: identity.householdId,
                    recordId: record.id,
                    purpose: "document-data-key",
                    keyVersion: record.encryptionKeyVersion,
                  },
                );
          try {
            return {
              document: {
                id: record.id,
                status: record.status,
                version: record.version,
              },
              encryption: {
                algorithm: "A256GCM" as const,
                keyBase64: Buffer.from(returnedKey).toString("base64"),
                keyVersion: record.encryptionKeyVersion,
                purpose: "document-original",
              },
            };
          } finally {
            if (returnedKey !== dataKey) returnedKey.fill(0);
          }
        } finally {
          dataKey.fill(0);
          householdKey.plaintextKey.fill(0);
        }
      },
      createDocumentUploadUrl: async (identity, input) => {
        const document = await repository.getPendingDocumentUpload(
          identity,
          input.documentId,
        );
        if (document.version !== input.expectedVersion)
          throw new Error("document upload version conflict");
        const expiresInSeconds = 300;
        return {
          uploadUrl: await documentObjectStore.createPresignedUpload({
            objectKey: document.objectKey,
            checksumSha256Base64: Buffer.from(
              input.ciphertextSha256,
              "hex",
            ).toString("base64"),
            contentType: "application/vnd.legacy-vault.encrypted+json",
            expiresInSeconds,
          }),
          expiresInSeconds,
        };
      },
      completeDocumentUpload: async (identity, input) => {
        const document = await repository.getPendingDocumentUpload(
          identity,
          input.documentId,
        );
        if (document.version !== input.expectedVersion)
          throw new Error("document upload version conflict");
        await documentObjectStore.assertStoredChecksum(
          document.objectKey,
          Buffer.from(input.ciphertextSha256, "hex").toString("base64"),
        );
        const started = await repository.completeDocumentUpload(identity, {
          ...input,
          uploadedAt: new Date().toISOString(),
        });
        await enqueueWorkflow(workflowQueue, "document-process", {
          workflowId: started.workflow.id,
          organizationId: identity.organizationId,
          householdId: identity.householdId,
          actorId: identity.actorId,
        });
        return started;
      },
      completeManualDocumentExtraction: async (identity, input) => {
        const requestFingerprint = createHash("sha256")
          .update(
            JSON.stringify({
              documentId: input.documentId,
              workflowId: input.workflowId,
              expectedWorkflowVersion: input.expectedWorkflowVersion,
              candidates: input.candidates,
            }),
          )
          .digest("hex");
        const householdKey =
          await householdKeyStore.getOrCreateActiveKey(identity);
        const plaintextValues: Buffer[] = [];
        try {
          const candidates = input.candidates.map((candidate) => {
            const serialized = JSON.stringify(candidate.value);
            if (serialized === undefined)
              throw new Error("manual extraction value is invalid");
            const prohibited = scanDlp(serialized).filter(
              (finding) => finding !== "prompt-injection",
            );
            if (prohibited.length)
              throw new Error("manual extraction contains prohibited content");
            const plaintext = Buffer.from(serialized, "utf8");
            plaintextValues.push(plaintext);
            const id = randomUUID();
            return {
              id,
              evidenceId: randomUUID(),
              fieldKey: candidate.fieldKey,
              ciphertext: Buffer.from(
                JSON.stringify(
                  encryptEnvelope(plaintext, householdKey.plaintextKey, {
                    organizationId: identity.organizationId,
                    householdId: identity.householdId,
                    recordId: id,
                    purpose: `fact-value:${candidate.fieldKey}`,
                    keyVersion: householdKey.keyVersion,
                  }),
                ),
              ),
              keyVersion: householdKey.keyVersion,
              sourceType: "document",
              sourceId: input.documentId,
              evidenceIds: [] as string[],
              ...(candidate.confidence === undefined
                ? {}
                : { confidence: candidate.confidence }),
              sensitivity: candidate.sensitivity,
              locator: candidate.locator,
            };
          });
          return repository.completeManualDocumentExtraction(identity, {
            documentId: input.documentId,
            workflowId: input.workflowId,
            expectedWorkflowVersion: input.expectedWorkflowVersion,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            capturedAt: new Date().toISOString(),
            candidates,
          });
        } finally {
          for (const plaintext of plaintextValues) plaintext.fill(0);
          householdKey.plaintextKey.fill(0);
        }
      },
      runAiInterview: async (identity, input) => {
        if (!deepSeek.readiness().configured)
          throw new Error("AI provider is unavailable");
        const consent = await repository.getActiveConsent(identity, {
          personId: identity.actorId,
          purpose: "external-ai",
        });
        if (!consent || consent.version !== input.expectedConsentVersion)
          throw new Error("affirmative external AI consent is required");
        const categories = [...new Set(input.categories)].sort();
        if (
          categories.length === 0 ||
          !categories.every((category) =>
            allRecordCategories.includes(category),
          )
        )
          throw new Error("AI categories are invalid");
        const envelope = {
          promptFamily: "interview-assistance",
          promptVersion: "v1",
          globalPolicy:
            "Return evidence-linked candidate suggestions only. Never state that a candidate is confirmed. Never request or reproduce passwords, PINs, recovery codes, seed phrases, private keys, full payment card numbers, complete Social Security numbers, authentication answers, or safe combinations.",
          taskPolicy:
            "Use only the supplied message. Return JSON with candidates and one nullable followUpQuestion. Each candidate needs a canonical fieldKey, proposedValue, an exact short evidenceQuote from the message, and confidence from 0 to 1.",
          outputSchema: {
            candidates: [
              {
                fieldKey: "insurance.carrier",
                proposedValue: "string or structured JSON value",
                evidenceQuote: "exact supporting words",
                confidence: 0.9,
              },
            ],
            followUpQuestion: "string or null",
          },
          safeHouseholdCapsule: {
            allowedCategories: categories,
            authoritativeStatus: "candidate-only",
          },
          content: stableStringify({ categories, message: input.message }),
        };
        const requestHash = createHash("sha256")
          .update(stableStringify({ categories, message: input.message }))
          .digest("hex");
        const idempotencyCacheKey = stableStringify({
          organizationId: identity.organizationId,
          householdId: identity.householdId,
          idempotencyKey: input.idempotencyKey,
        });
        const idempotent = aiIdempotencyCache.get(idempotencyCacheKey);
        if (idempotent) {
          if (idempotent.requestHash !== requestHash)
            throw new Error("AI idempotency key conflict");
          return idempotent.response;
        }
        const exactCacheKey = aiGateway.cacheKey({
          organizationId: identity.organizationId,
          householdId: identity.householdId,
          envelope,
        });
        let parsed = aiExactCache.get(exactCacheKey) as
          z.infer<typeof aiInterviewSchema> | undefined;
        if (!parsed) {
          parsed = await aiGateway.execute({
            organizationId: identity.organizationId,
            householdId: identity.householdId,
            purpose: "interview-assistance",
            consentGranted: true,
            envelope,
            schema: aiInterviewSchema,
            mode: "standard",
            model: deepSeekRuntime.model,
            maxOutputTokens: 1_024,
            estimatedInputCostPerMillion: 0,
            estimatedOutputCostPerMillion: 0,
          });
          for (const candidate of parsed.candidates) {
            const category = recordCategoryFromFieldKey(candidate.fieldKey);
            if (!categories.includes(category))
              throw new Error("AI output exceeded allowed categories");
          }
          const outputFindings = scanDlp(stableStringify(parsed)).filter(
            (finding) => finding !== "prompt-injection",
          );
          if (outputFindings.length)
            throw new Error("AI output contains prohibited content");
          aiExactCache.set(exactCacheKey, parsed);
          if (aiExactCache.size > 1_000)
            aiExactCache.delete(aiExactCache.keys().next().value ?? "");
        }
        const response = {
          provider: "deepseek" as const,
          model: deepSeekRuntime.model,
          consent: {
            id: consent.id,
            policyVersion: consent.policyVersion,
            version: consent.version,
          },
          categoriesSent: categories,
          authoritative: false as const,
          ...parsed,
        };
        aiIdempotencyCache.set(idempotencyCacheKey, {
          requestHash,
          response,
        });
        if (aiIdempotencyCache.size > 1_000)
          aiIdempotencyCache.delete(
            aiIdempotencyCache.keys().next().value ?? "",
          );
        return response;
      },
    },
    async close() {
      await Promise.all([
        repository.close(),
        identityStore.close(),
        authRuntime.close(),
        auditStore.close(),
        workflowQueue.close(),
        householdKeyStore.close(),
      ]);
    },
  };
}
