import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
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
