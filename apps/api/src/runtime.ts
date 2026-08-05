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
import { createWorkflowQueue, enqueueWorkflow } from "@legacy/worker";
import { generateReport } from "@legacy/reports";
import type { CandidateFact } from "@legacy/domain";
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
  const workflowQueue = createWorkflowQueue(environment.REDIS_URL);
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
      createReport: async (identity, kind) => {
        const encryptedFacts =
          await repository.listConfirmedFactsForReport(identity);
        const householdKey =
          await householdKeyStore.getOrCreateActiveKey(identity);
        try {
          const facts: CandidateFact[] = encryptedFacts.map((fact) => {
            const envelope = JSON.parse(
              Buffer.from(fact.ciphertext).toString("utf8"),
            ) as EncryptedEnvelope;
            const opened = decryptEnvelope(
              envelope,
              householdKey.plaintextKey,
              {
                organizationId: identity.organizationId,
                householdId: identity.householdId,
                recordId: fact.id,
                purpose: `fact-value:${fact.fieldKey}`,
                keyVersion: fact.keyVersion,
              },
            );
            return {
              id: fact.id,
              organizationId: identity.organizationId,
              householdId: identity.householdId,
              fieldKey: fact.fieldKey,
              typedValue: JSON.parse(Buffer.from(opened).toString("utf8")),
              status: "confirmed",
              sourceType: fact.sourceType as CandidateFact["sourceType"],
              sourceId: fact.sourceId,
              evidenceIds: fact.evidenceIds,
              ...(fact.confidence === undefined
                ? {}
                : { confidence: fact.confidence }),
              sensitivity: fact.sensitivity as CandidateFact["sensitivity"],
              confirmedBy: fact.confirmedBy,
              confirmedAt: fact.confirmedAt,
              version: fact.version,
            };
          });
          const report = generateReport({
            id: randomUUID(),
            organizationId: identity.organizationId,
            householdId: identity.householdId,
            kind,
            generatedAt: new Date().toISOString(),
            facts,
          });
          return repository.persistReport(identity, report);
        } finally {
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
