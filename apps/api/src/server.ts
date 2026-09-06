import 'dotenv/config';
import { createApp } from './app';

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
const app = createApp();

app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
});
