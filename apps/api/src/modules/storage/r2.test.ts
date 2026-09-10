import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R2StorageService, type StorageService } from './r2';
import type { R2Config } from './config';

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = mockSend;
  }
  class MockPutObjectCommand {
    constructor(public input: unknown) {}
  }
  class MockGetObjectCommand {
    constructor(public input: unknown) {}
  }
  class MockDeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  class MockHeadObjectCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

describe('R2StorageService', () => {
  const testConfig: R2Config = {
    accountId: 'acc-test',
    accessKeyId: 'key-test',
    secretAccessKey: 'sec-test',
    bucketName: 'bucket-test',
    endpoint: 'https://acc-test.r2.cloudflarestorage.com',
  };

  let service: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new R2StorageService(testConfig);
  });

  it('generates presigned PUT upload URL with ContentType and Length', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://signed-put-url.local');

    const url = await service.createPresignedUploadUrl('path/to/key', 'image/png', 2048, 900);
    expect(url).toBe('https://signed-put-url.local');
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'bucket-test',
          Key: 'path/to/key',
          ContentType: 'image/png',
          ContentLength: 2048,
        }),
      }),
      { expiresIn: 900 },
    );
  });

  it('generates presigned GET download URL with ResponseContentDisposition inline header', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://signed-get-url.local');

    const url = await service.createPresignedDownloadUrl('path/to/key', 'sample file.pdf', 300);
    expect(url).toBe('https://signed-get-url.local');
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'bucket-test',
          Key: 'path/to/key',
          ResponseContentDisposition: expect.stringContaining('sample file.pdf'),
        }),
      }),
      { expiresIn: 300 },
    );
  });

  it('calls DeleteObjectCommand on S3 client', async () => {
    mockSend.mockResolvedValueOnce({});
    await service.deleteObject('path/to/doomed-key');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'bucket-test',
          Key: 'path/to/doomed-key',
        },
      }),
    );
  });

  it('returns object size and contentType on headObject', async () => {
    mockSend.mockResolvedValueOnce({
      ContentLength: 4096,
      ContentType: 'application/pdf',
    });

    const res = await service.headObject('path/to/key');
    expect(res).toEqual({
      size: 4096,
      contentType: 'application/pdf',
    });
  });

  it('returns null on headObject when error occurs (e.g. NotFound)', async () => {
    mockSend.mockRejectedValueOnce(new Error('NotFound'));
    const res = await service.headObject('path/to/missing');
    expect(res).toBeNull();
  });
});
