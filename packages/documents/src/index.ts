import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  GetObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  allowBucketCreation: boolean;
}

export class ObjectIntegrityError extends Error {
  override readonly name = "ObjectIntegrityError";
}

export class DocumentValidationError extends Error {
  override readonly name = "DocumentValidationError";
}

export type SupportedDocumentType =
  "application/pdf" | "image/jpeg" | "image/png" | "image/tiff";

const signatures: ReadonlyArray<{
  mediaType: SupportedDocumentType;
  matches: (input: Uint8Array) => boolean;
}> = [
  {
    mediaType: "application/pdf",
    matches: (input) =>
      Buffer.from(input.subarray(0, 5)).equals(Buffer.from("%PDF-")),
  },
  {
    mediaType: "image/jpeg",
    matches: (input) =>
      input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff,
  },
  {
    mediaType: "image/png",
    matches: (input) =>
      Buffer.from(input.subarray(0, 8)).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
  },
  {
    mediaType: "image/tiff",
    matches: (input) => {
      const prefix = Buffer.from(input.subarray(0, 4));
      return (
        prefix.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        prefix.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
      );
    },
  },
];

export function validateDocumentBytes(input: {
  bytes: Uint8Array;
  declaredMediaType: string;
  maximumBytes: number;
}): SupportedDocumentType {
  if (input.bytes.byteLength === 0)
    throw new DocumentValidationError("document is empty");
  if (input.bytes.byteLength > input.maximumBytes)
    throw new DocumentValidationError(
      "document exceeds the configured size limit",
    );
  const detected = signatures.find(({ matches }) =>
    matches(input.bytes),
  )?.mediaType;
  if (!detected)
    throw new DocumentValidationError("document type is not supported");
  if (detected !== input.declaredMediaType)
    throw new DocumentValidationError(
      "declared media type does not match file signature",
    );
  return detected;
}

export interface MalwareScanResult {
  status: "clean" | "infected";
  signature?: string;
}

export interface MalwareScanner {
  scan(bytes: Uint8Array): Promise<MalwareScanResult>;
}

export interface DocumentScanRecord {
  objectKey: string;
  declaredMediaType: string;
  maximumBytes: number;
}

export interface QuarantineObjectStore {
  getCiphertext(objectKey: string): Promise<Uint8Array>;
  markClean(objectKey: string): Promise<void>;
}

export class DocumentQuarantineService {
  constructor(
    private readonly objectStore: QuarantineObjectStore,
    private readonly scanner: MalwareScanner,
    private readonly decrypt: (ciphertext: Uint8Array) => Promise<Uint8Array>,
  ) {}

  async scan(
    record: DocumentScanRecord,
  ): Promise<
    | { status: "clean-awaiting-ocr"; mediaType: SupportedDocumentType }
    | { status: "rejected-malware"; signature: string }
  > {
    const ciphertext = await this.objectStore.getCiphertext(record.objectKey);
    const plaintext = await this.decrypt(ciphertext);
    try {
      const mediaType = validateDocumentBytes({
        bytes: plaintext,
        declaredMediaType: record.declaredMediaType,
        maximumBytes: record.maximumBytes,
      });
      const result = await this.scanner.scan(plaintext);
      if (result.status === "infected") {
        return {
          status: "rejected-malware",
          signature: result.signature ?? "unknown",
        };
      }
      await this.objectStore.markClean(record.objectKey);
      return { status: "clean-awaiting-ocr", mediaType };
    } finally {
      plaintext.fill(0);
    }
  }
}

export class ClamAvScanner {
  constructor(
    private readonly config: { host: string; port: number; timeoutMs: number },
  ) {}

  scan(bytes: Uint8Array): Promise<MalwareScanResult> {
    if (bytes.byteLength === 0)
      return Promise.reject(new DocumentValidationError("document is empty"));
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.config.host,
        port: this.config.port,
      });
      const response: Buffer[] = [];
      const timer = setTimeout(() => {
        socket.destroy(new Error("ClamAV scan timed out"));
      }, this.config.timeoutMs);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
      };
      socket.once("error", finish);
      socket.on("data", (chunk: Buffer) => response.push(chunk));
      socket.once("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
          const chunk = bytes.subarray(offset, offset + 64 * 1024);
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.byteLength);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.once("close", (hadError) => {
        clearTimeout(timer);
        if (hadError) return;
        const message = Buffer.concat(response)
          .toString("utf8")
          .replaceAll("\0", "")
          .trim();
        const infected = /^stream: (.+) FOUND$/.exec(message);
        if (infected?.[1])
          return resolve({ status: "infected", signature: infected[1] });
        if (message === "stream: OK") return resolve({ status: "clean" });
        reject(
          new Error(
            `ClamAV returned an invalid response: ${message || "empty"}`,
          ),
        );
      });
    });
  }
}

export class OcrMyPdfAdapter {
  constructor(
    private readonly config: { executable: string; timeoutMs: number },
  ) {}

  async extractSearchablePdf(input: Uint8Array): Promise<Uint8Array> {
    validateDocumentBytes({
      bytes: input,
      declaredMediaType: "application/pdf",
      maximumBytes: 100 * 1024 * 1024,
    });
    const directory = await mkdtemp(join(tmpdir(), "legacy-vault-ocr-"));
    const source = join(directory, "source.pdf");
    const output = join(directory, "output.pdf");
    try {
      await writeFile(source, input, { mode: 0o600 });
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          this.config.executable,
          ["--skip-text", "--output-type", "pdf", "--", source, output],
          {
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
          },
        );
        let diagnostic = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
          if (diagnostic.length < 2_000) diagnostic += chunk;
        });
        const timer = setTimeout(() => child.kill(), this.config.timeoutMs);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code, signal) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else
            reject(
              new Error(`OCR failed (${signal ?? code}): ${diagnostic.trim()}`),
            );
        });
      });
      return new Uint8Array(await readFile(output));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export class DocumentObjectStore {
  readonly #client: S3Client;
  constructor(private readonly config: ObjectStoreConfig) {
    this.#client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestHandler: { requestTimeout: 20_000, connectionTimeout: 5_000 },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.#client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
    } catch (error) {
      if (!this.config.allowBucketCreation) throw error;
      await this.#client.send(
        new CreateBucketCommand({ Bucket: this.config.bucket }),
      );
    }
  }

  createObjectKey(): string {
    return `quarantine/${randomUUID()}`;
  }

  async createPresignedUpload(input: {
    objectKey: string;
    checksumSha256Base64: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    if (!input.objectKey.startsWith("quarantine/"))
      throw new ObjectIntegrityError("new uploads must enter quarantine");
    if (input.expiresInSeconds < 30 || input.expiresInSeconds > 900)
      throw new ObjectIntegrityError(
        "upload expiry must be between 30 and 900 seconds",
      );
    return getSignedUrl(
      this.#client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        ChecksumSHA256: input.checksumSha256Base64,
        ContentType: input.contentType,
        Tagging: "status=quarantined",
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async putCiphertext(input: {
    objectKey: string;
    ciphertext: Uint8Array;
    checksumSha256Base64: string;
    contentType: string;
  }): Promise<void> {
    if (!input.objectKey.startsWith("quarantine/"))
      throw new ObjectIntegrityError("new uploads must enter quarantine");
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        Body: input.ciphertext,
        ChecksumSHA256: input.checksumSha256Base64,
        ContentType: input.contentType,
        Tagging: "status=quarantined",
      }),
    );
  }

  async assertStoredChecksum(
    objectKey: string,
    checksumSha256Base64: string,
  ): Promise<void> {
    const result = await this.#client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
        ChecksumMode: "ENABLED",
      }),
    );
    if (result.ChecksumSHA256 !== checksumSha256Base64)
      throw new ObjectIntegrityError("stored object checksum mismatch");
  }

  async markClean(objectKey: string): Promise<void> {
    await this.#client.send(
      new PutObjectTaggingCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
        Tagging: { TagSet: [{ Key: "status", Value: "clean" }] },
      }),
    );
  }

  async objectStatus(objectKey: string): Promise<string | undefined> {
    const result = await this.#client.send(
      new GetObjectTaggingCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }),
    );
    return result.TagSet?.find(({ Key }) => Key === "status")?.Value;
  }

  async getCiphertext(objectKey: string): Promise<Uint8Array> {
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new ObjectIntegrityError("object body missing");
    return result.Body.transformToByteArray();
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
    );
  }
}
