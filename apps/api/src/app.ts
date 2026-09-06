import express, { type Express, type NextFunction, type Request, type Response } from 'express';

/**
 * Application factory (kept separate from `server.ts` so tests can exercise
 * the app without binding a port).
 *
 * Phase 0 exposes GET /health only. Future domain modules mount their routers
 * here (auth, workspaces, channels, messaging, …).
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not Found' } });
  });

  // Centralized error handler. Four parameters are required for Express to
  // treat this as error-handling middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } });
  });

  return app;
}
