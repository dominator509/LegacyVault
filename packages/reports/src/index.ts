import {
  assertReportProvenance,
  createReportClaims,
  type CandidateFact,
  type Report,
} from "@legacy/domain";
import { createHash } from "node:crypto";
import {
  decryptEnvelope,
  encryptEnvelope,
  ExportManifestSigner,
  type EncryptedEnvelope,
} from "@legacy/crypto";

export function generateReport(input: {
  id: string;
  organizationId: string;
  householdId: string;
  kind: Report["kind"];
  generatedAt: string;
  facts: readonly CandidateFact[];
  missingCategories?: Report["missingCategories"];
  notices?: Report["notices"];
  reviewFindings?: Report["reviewFindings"];
}): Report {
  const report: Report = {
    id: input.id,
    organizationId: input.organizationId,
    householdId: input.householdId,
    kind: input.kind,
    generatedAt: input.generatedAt,
    claims: createReportClaims(input.facts),
    sourceFactVersions: Object.fromEntries(
      input.facts.map((fact) => [fact.id, fact.version]),
    ),
    ...(input.missingCategories
      ? { missingCategories: input.missingCategories }
      : {}),
    ...(input.notices ? { notices: input.notices } : {}),
    ...(input.reviewFindings ? { reviewFindings: input.reviewFindings } : {}),
    version: 1,
  };
  assertReportProvenance(report);
  return report;
}

export class PortableExportError extends Error {
  override readonly name = "PortableExportError";
}

export interface PortableExportEntry {
  path: string;
  mediaType: string;
  bytes: Uint8Array;
}

export interface InnerExportEntry {
  path: string;
  mediaType: string;
  sha256: string;
  size: number;
  contentBase64: string;
}

export interface InnerExportManifest {
  format: "legacy-vault-portable-export/v1";
  archiveId: string;
  organizationId: string;
  householdId: string;
  createdAt: string;
  entries: InnerExportEntry[];
}

interface PublicExportManifest {
  format: "legacy-vault-encrypted-export/v1";
  archiveId: string;
  createdAt: string;
  encryption: "A256GCM";
  keyVersion: number;
  envelopeSha256: string;
}

interface PortableExportContainer {
  manifest: PublicExportManifest;
  envelope: EncryptedEnvelope;
  signature: string;
  signerPublicKey: string;
}

export function canonicalReportValue(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalReportValue).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${canonicalReportValue(entry)}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exportContext(archiveId: string, keyVersion: number) {
  return {
    organizationId: "portable-export",
    householdId: "portable-export",
    recordId: archiveId,
    purpose: "portable-export",
    keyVersion,
  };
}

function assertEntry(entry: PortableExportEntry): void {
  if (
    !entry.path ||
    entry.path.startsWith("/") ||
    entry.path.includes("\\") ||
    entry.path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new PortableExportError("export entry path is unsafe");
  if (!/^[a-z0-9][a-z0-9.+-]+\/[a-z0-9][a-z0-9.+-]+$/iu.test(entry.mediaType))
    throw new PortableExportError("export entry media type is invalid");
}

export function createPortableExport(input: {
  archiveId: string;
  organizationId: string;
  householdId: string;
  createdAt: string;
  keyVersion: number;
  exportKey: Uint8Array;
  signingKeyPkcs8Base64: string;
  entries: readonly PortableExportEntry[];
}): Uint8Array {
  if (!input.archiveId || !input.organizationId || !input.householdId)
    throw new PortableExportError("export identity is incomplete");
  if (!Number.isFinite(Date.parse(input.createdAt)))
    throw new PortableExportError("export creation time is invalid");
  const paths = new Set<string>();
  const entries = [...input.entries]
    .map((entry): InnerExportEntry => {
      assertEntry(entry);
      if (paths.has(entry.path))
        throw new PortableExportError("export entry path is duplicated");
      paths.add(entry.path);
      return {
        path: entry.path,
        mediaType: entry.mediaType,
        sha256: digest(entry.bytes),
        size: entry.bytes.byteLength,
        contentBase64: Buffer.from(entry.bytes).toString("base64"),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const inner: InnerExportManifest = {
    format: "legacy-vault-portable-export/v1",
    archiveId: input.archiveId,
    organizationId: input.organizationId,
    householdId: input.householdId,
    createdAt: input.createdAt,
    entries,
  };
  const envelope = encryptEnvelope(
    Buffer.from(canonicalReportValue(inner), "utf8"),
    input.exportKey,
    exportContext(input.archiveId, input.keyVersion),
  );
  const manifest: PublicExportManifest = {
    format: "legacy-vault-encrypted-export/v1",
    archiveId: input.archiveId,
    createdAt: input.createdAt,
    encryption: "A256GCM",
    keyVersion: input.keyVersion,
    envelopeSha256: digest(Buffer.from(canonicalReportValue(envelope), "utf8")),
  };
  const signer = new ExportManifestSigner(input.signingKeyPkcs8Base64);
  const manifestBytes = Buffer.from(canonicalReportValue(manifest), "utf8");
  const container: PortableExportContainer = {
    manifest,
    envelope,
    signature: signer.sign(manifestBytes),
    signerPublicKey: signer.publicKeySpkiBase64(),
  };
  return Buffer.from(canonicalReportValue(container), "utf8");
}

function parseContainer(bytes: Uint8Array): PortableExportContainer {
  try {
    return JSON.parse(
      Buffer.from(bytes).toString("utf8"),
    ) as PortableExportContainer;
  } catch {
    throw new PortableExportError("export container is invalid");
  }
}

export function verifyAndOpenPortableExport(input: {
  container: Uint8Array;
  exportKey: Uint8Array;
  trustedPublicKeySpkiBase64: string;
}): InnerExportManifest {
  const container = parseContainer(input.container);
  if (
    container.manifest?.format !== "legacy-vault-encrypted-export/v1" ||
    container.envelope?.algorithm !== "A256GCM" ||
    container.manifest.encryption !== "A256GCM" ||
    container.manifest.keyVersion !== container.envelope.keyVersion ||
    container.signerPublicKey !== input.trustedPublicKeySpkiBase64
  )
    throw new PortableExportError("export container metadata is invalid");
  const envelopeDigest = digest(
    Buffer.from(canonicalReportValue(container.envelope), "utf8"),
  );
  if (envelopeDigest !== container.manifest.envelopeSha256)
    throw new PortableExportError("export envelope digest is invalid");
  const manifestBytes = Buffer.from(
    canonicalReportValue(container.manifest),
    "utf8",
  );
  if (
    !ExportManifestSigner.verify(
      manifestBytes,
      container.signature,
      input.trustedPublicKeySpkiBase64,
    )
  )
    throw new PortableExportError("export manifest signature is invalid");
  let inner: InnerExportManifest;
  try {
    inner = JSON.parse(
      Buffer.from(
        decryptEnvelope(
          container.envelope,
          input.exportKey,
          exportContext(
            container.manifest.archiveId,
            container.manifest.keyVersion,
          ),
        ),
      ).toString("utf8"),
    ) as InnerExportManifest;
  } catch {
    throw new PortableExportError("export decryption failed");
  }
  if (
    inner.format !== "legacy-vault-portable-export/v1" ||
    inner.archiveId !== container.manifest.archiveId ||
    inner.createdAt !== container.manifest.createdAt ||
    !Array.isArray(inner.entries)
  )
    throw new PortableExportError("export payload manifest is invalid");
  const seen = new Set<string>();
  for (const entry of inner.entries) {
    assertEntry({
      path: entry.path,
      mediaType: entry.mediaType,
      bytes: new Uint8Array(),
    });
    if (seen.has(entry.path))
      throw new PortableExportError("export payload path is duplicated");
    seen.add(entry.path);
    const content = Buffer.from(entry.contentBase64, "base64");
    if (content.byteLength !== entry.size || digest(content) !== entry.sha256)
      throw new PortableExportError("export entry digest is invalid");
  }
  return inner;
}
