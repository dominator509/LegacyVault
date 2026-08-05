import { createHash, randomUUID } from "node:crypto";
import { PostgresAuditStore } from "@legacy/audit";
import {
  AuthorizationDeniedError,
  createLegacyAuth,
  MembershipIdentityStore,
  requireIdentityAuthorization,
  resolveRequestIdentity,
} from "@legacy/auth";
import type { Environment } from "@legacy/contracts/environment";
import { encryptEnvelope } from "@legacy/crypto";
import { VaultRepository } from "@legacy/database/repository";
import { createWorkflowQueue, enqueueWorkflow } from "@legacy/worker";
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
    !environment.EMAIL_FROM
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
    },
    async close() {
      await Promise.all([
        repository.close(),
        identityStore.close(),
        authRuntime.close(),
        auditStore.close(),
        workflowQueue.close(),
      ]);
    },
  };
}
