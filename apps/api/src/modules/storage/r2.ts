/**
 * Cloudflare R2 Storage Service (Phase 4J.1).
 *
 * Wraps AWS S3 SDK for Cloudflare R2 object storage operations:
 * - Presigned PUT URL generation for direct client uploads
 * - Presigned GET URL generation for authorized client downloads
 * - Object deletion
 * - Object head/metadata check
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Config, type R2Config } from './config';
import { PRESIGNED_DOWNLOAD_EXPIRY_SECONDS, PRESIGNED_UPLOAD_EXPIRY_SECONDS } from './validation';

export interface StorageService {
  createPresignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn?: number,
  ): Promise<string>;
  createPresignedDownloadUrl(
    key: string,
    originalName: string,
    expiresIn?: number,
  ): Promise<string>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<{ size: number; contentType?: string } | null>;
  /**
   * Verifies the bucket is reachable with the configured credentials.
   * Throws on any failure (bad credentials, missing bucket, network).
   */
  checkConnectivity(): Promise<void>;
}

export class R2StorageService implements StorageService {
  private client: S3Client;
  private bucketName: string;

  constructor(config?: R2Config) {
    const r2Config = config ?? getR2Config();
    this.bucketName = r2Config.bucketName;
    this.client = new S3Client({
      region: 'auto',
      endpoint: r2Config.endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
  }

  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn = PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async createPresignedDownloadUrl(
    key: string,
    originalName: string,
    expiresIn = PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
  ): Promise<string> {
    // Encode filename safely in Content-Disposition inline header
    const encodedFilename = encodeURIComponent(originalName);
    const contentDisposition = `attachment; filename="${originalName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: contentDisposition,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  async headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const res = await this.client.send(command);
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType,
      };
    } catch {
      return null;
    }
  }

  async checkConnectivity(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
  }
}

let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new R2StorageService();
  }
  return storageServiceInstance;
}

export function setStorageService(service: StorageService | null): void {
  storageServiceInstance = service;
}
