import http from 'node:http';
import 'dotenv/config';
import { createApp } from './app';
import { initRealtime } from './modules/realtime/index';
import { getStorageService } from './modules/storage/r2';
import { isR2Configured } from './modules/storage/config';

const DEFAULT_PORT = 4000;

function resolvePort(): number {
  const raw = process.env.PORT;
  if (!raw) {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${JSON.stringify(raw)}. Expected an integer 1-65535.`);
  }
  return port;
}

const port = resolvePort();
if (!process.env.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY.trim().length === 0) {
  throw new Error('CLERK_SECRET_KEY is not set. Configure it in the API environment.');
}
const app = createApp();
const httpServer = http.createServer(app);

initRealtime(httpServer);

httpServer.listen(port, () => {
  console.log(`[api] listening on :${port}`);
  // Non-blocking storage health check: attachment uploads fail opaquely
  // in the browser when R2 credentials are wrong, so fail loud here.
  if (isR2Configured()) {
    getStorageService()
      .checkConnectivity()
      .then(() => console.log('[api] R2 storage reachable'))
      .catch((error: unknown) => {
        console.error(
          '[api] R2 storage UNREACHABLE — attachment uploads will fail. ' +
            'Check R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME.',
          error instanceof Error ? error.message : error,
        );
      });
  } else {
    console.error('[api] R2 storage not configured — attachment uploads will fail.');
  }
});
