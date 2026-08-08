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
    private readonly config: {
      executable: string;
      pythonExecutable: string;
      timeoutMs: number;
    },
  ) {}

  async extractSearchablePdf(
    input: Uint8Array,
    declaredMediaType = "application/pdf",
  ): Promise<Uint8Array> {
    const mediaType = validateDocumentBytes({
      bytes: input,
      declaredMediaType,
      maximumBytes: 100 * 1024 * 1024,
    });
    const directory = await mkdtemp(join(tmpdir(), "legacy-vault-ocr-"));
    const source = join(directory, documentSourceName(mediaType));
    const normalized = join(directory, "normalized.pdf");
    const normalizer = join(directory, "normalize.py");
    const output = join(directory, "output.pdf");
    try {
      await writeFile(source, input, { mode: 0o600 });
      await writeFile(normalizer, documentNormalizer, { mode: 0o600 });
      await runBoundedProcess(
        this.config.pythonExecutable,
        [normalizer, mediaType, source, normalized],
        this.config.timeoutMs,
        "document normalization",
      );
      await runBoundedProcess(
        this.config.executable,
        ocrArguments(
          "application/pdf",
          mediaType === "application/pdf" ? source : normalized,
          output,
        ),
        this.config.timeoutMs,
        "OCR",
      );
      return new Uint8Array(await readFile(output));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

const documentNormalizer = String.raw`import sys
import warnings
from PIL import Image, ImageSequence
import pikepdf

media_type, source, output = sys.argv[1:5]
maximum_pages = 100
if media_type == "application/pdf":
    with pikepdf.open(source) as document:
        if len(document.pages) > maximum_pages:
            raise ValueError("document exceeds the configured page limit")
else:
    Image.MAX_IMAGE_PIXELS = 50_000_000
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    frames = []
    with Image.open(source) as image:
        for index, frame in enumerate(ImageSequence.Iterator(image)):
            if index >= maximum_pages:
                raise ValueError("document exceeds the configured page limit")
            normalized = frame.convert("RGB")
            normalized.load()
            frames.append(normalized.copy())
    if not frames:
        raise ValueError("document contains no image frames")
    frames[0].save(
        output,
        "PDF",
        save_all=True,
        append_images=frames[1:],
        resolution=300,
    )
    for frame in frames:
        frame.close()
`;

async function runBoundedProcess(
  executable: string,
  arguments_: string[],
  timeoutMs: number,
  operation: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostic = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (diagnostic.length < 2_000) diagnostic += chunk;
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${operation} failed (${signal ?? code}): ${diagnostic.trim()}`,
          ),
        );
    });
  });
}

function documentSourceName(mediaType: SupportedDocumentType): string {
  switch (mediaType) {
    case "application/pdf":
      return "source.pdf";
    case "image/jpeg":
      return "source.jpg";
    case "image/png":
      return "source.png";
    case "image/tiff":
      return "source.tiff";
  }
}

function ocrArguments(
  mediaType: SupportedDocumentType,
  source: string,
  output: string,
): string[] {
  return [
    "--jobs",
    "2",
    "--max-image-mpixels",
    "50",
    "--tesseract-timeout",
    "60",
    ...(mediaType === "application/pdf"
      ? ["--skip-text"]
      : ["--image-dpi", "300"]),
    "--output-type",
    "pdf",
    "--",
    source,
    output,
  ];
}

export class DockerOcrMyPdfAdapter {
  constructor(
    private readonly config: {
      dockerExecutable: string;
      image: string;
      timeoutMs: number;
    },
  ) {
    if (!config.image.includes("@sha256:"))
      throw new DocumentValidationError(
        "OCR container image must be pinned by digest",
      );
  }

  async extractSearchablePdf(
    input: Uint8Array,
    declaredMediaType = "application/pdf",
  ): Promise<Uint8Array> {
    const mediaType = validateDocumentBytes({
      bytes: input,
      declaredMediaType,
      maximumBytes: 100 * 1024 * 1024,
    });
    const directory = await mkdtemp(
      join(tmpdir(), "legacy-vault-ocr-container-"),
    );
    const sourceName = documentSourceName(mediaType);
    const source = join(directory, sourceName);
    const normalizedName = "normalized.pdf";
    const normalizerName = "normalize.py";
    const output = join(directory, "output.pdf");
    try {
      await writeFile(source, input, { mode: 0o600 });
      await writeFile(join(directory, normalizerName), documentNormalizer, {
        mode: 0o600,
      });
      const containerPrefix = [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "256",
        "--memory",
        "1g",
        "--cpus",
        "2",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=512m",
        "--volume",
        `${directory}:/work`,
        "--workdir",
        "/work",
      ];
      await runBoundedProcess(
        this.config.dockerExecutable,
        [
          ...containerPrefix,
          "--entrypoint",
          "python3",
          this.config.image,
          normalizerName,
          mediaType,
          sourceName,
          normalizedName,
        ],
        this.config.timeoutMs,
        "container document normalization",
      );
      await runBoundedProcess(
        this.config.dockerExecutable,
        [
          ...containerPrefix,
          this.config.image,
          ...ocrArguments(
            "application/pdf",
            mediaType === "application/pdf" ? sourceName : normalizedName,
            "output.pdf",
          ),
        ],
        this.config.timeoutMs,
        "container OCR",
      );
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

  async healthCheck(): Promise<void> {
    await this.#client.send(
      new HeadBucketCommand({ Bucket: this.config.bucket }),
    );
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

  async putGeneratedExport(input: {
    objectKey: string;
    ciphertext: Uint8Array;
    checksumSha256Base64: string;
  }): Promise<void> {
    if (!/^exports\/[0-9a-f-]{36}\.lvault$/iu.test(input.objectKey))
      throw new ObjectIntegrityError("export object key is invalid");
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        Body: input.ciphertext,
        ChecksumSHA256: input.checksumSha256Base64,
        ContentType: "application/vnd.legacy-vault.encrypted+json",
        Tagging: "status=completed&kind=portable-export",
      }),
    );
  }

  async createPresignedExportDownload(input: {
    objectKey: string;
    downloadName: string;
    expiresInSeconds: number;
  }): Promise<string> {
    if (!/^exports\/[0-9a-f-]{36}\.lvault$/iu.test(input.objectKey))
      throw new ObjectIntegrityError("export object key is invalid");
    if (!/^[0-9a-f-]{36}\.lvault$/iu.test(input.downloadName))
      throw new ObjectIntegrityError("export download name is invalid");
    if (input.expiresInSeconds < 30 || input.expiresInSeconds > 900)
      throw new ObjectIntegrityError(
        "download expiry must be between 30 and 900 seconds",
      );
    return getSignedUrl(
      this.#client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        ResponseContentType: "application/vnd.legacy-vault.encrypted+json",
        ResponseContentDisposition: `attachment; filename="${input.downloadName}"`,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async putDocumentDerivative(input: {
    objectKey: string;
    ciphertext: Uint8Array;
    checksumSha256Base64: string;
  }): Promise<void> {
    if (
      !/^derivatives\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.encrypted\.json$/iu.test(
        input.objectKey,
      )
    )
      throw new ObjectIntegrityError(
        "document derivative object key is invalid",
      );
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        Body: input.ciphertext,
        ChecksumSHA256: input.checksumSha256Base64,
        ContentType: "application/vnd.legacy-vault.encrypted+json",
        Tagging: "status=clean&kind=searchable-pdf",
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
