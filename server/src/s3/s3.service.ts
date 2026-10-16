import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.AWS_BUCKET_NAME!;
  }

  // Builds a namespaced key so files are organized per user and never collide.
  // Saved try-on images use 'tryon', outside the old "tryon/" lifecycle rule.
  buildKey(userId: string, kind: 'clothing' | 'body' | 'tryon', extension: string): string {
    return `users/${userId}/${kind}/${randomUUID()}.${extension}`;
  }

  // Returns a short-lived URL the client can PUT the file to directly.
  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: 300 }); // 5 minutes
  }

  // Returns a URL the client can GET the file from, valid for 24 hours.
  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: 60 * 60 * 24 }); // 24 hours
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // Deletes many files, 1000 per request (S3's limit). Never throws: returns
  // the keys that couldn't be deleted, and logs any batch that failed outright.
  async deleteObjects(keys: string[]): Promise<string[]> {
    const failed: string[] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        const res = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        for (const err of res.Errors ?? []) if (err.Key) failed.push(err.Key);
      } catch (err) {
        this.logger.warn(`Batch delete of ${batch.length} files failed: ${(err as Error).message}`);
        failed.push(...batch);
      }
    }
    return failed;
  }

  // Maps a content type to a file extension; null means "not an allowed image".
  extensionFor(contentType: string): string | null {
    return IMAGE_EXTENSIONS[contentType] ?? null;
  }

  // True if the file is actually in the bucket (the app finished uploading).
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  // Downloads a file from S3 into memory (used to process photos on the server).
  async getObjectBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) throw new Error(`Empty S3 object: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  // Uploads a file the server created itself (e.g. the cutout PNG).
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}