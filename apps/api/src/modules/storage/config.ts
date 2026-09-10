/**
 * Cloudflare R2 Storage Configuration (Phase 4J.1).
 *
 * Reads server-side environment variables strictly for Cloudflare R2 object storage.
 * Secrets are never exposed to browser/client bundles or returned over HTTP.
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

export class MissingR2ConfigError extends Error {
  constructor(missingVariables: string[]) {
    super(
      `Missing required Cloudflare R2 configuration: ${missingVariables.join(', ')}. ` +
        `Configure them in .env (never commit secrets).`,
    );
    this.name = 'MissingR2ConfigError';
  }
}

let cachedConfig: R2Config | null = null;

/**
 * Returns whether R2 environment variables are configured in the current environment.
 */
export function isR2Configured(): boolean {
  return (
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET_NAME
  );
}

/**
 * Loads and validates Cloudflare R2 configuration from environment variables.
 * Throws `MissingR2ConfigError` if any mandatory variables are missing.
 */
export function getR2Config(): R2Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const missing: string[] = [];
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId) missing.push('R2_ACCOUNT_ID');

  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');

  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');

  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  if (!bucketName) missing.push('R2_BUCKET_NAME');

  if (missing.length > 0) {
    throw new MissingR2ConfigError(missing);
  }

  const endpoint =
    process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;

  cachedConfig = {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucketName: bucketName!,
    endpoint,
  };

  return cachedConfig;
}

/** For test environment resets */
export function resetR2ConfigCache(): void {
  cachedConfig = null;
}
