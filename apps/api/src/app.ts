import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createMeRouter, getAuth, getTrustedOrigins, type AuthContext } from './modules/auth/index';
import { createChannelsRouter } from './modules/channels/index';
import { createChannelMessagesRouter, createMessagesRouter } from './modules/messages/index';
import {
  createDirectMessagesRouter,
  createWorkspaceDirectMessagesRouter,
} from './modules/direct-messages/index';
import {
  createInvitationAcceptRouter,
  createWorkspaceInvitationsRouter,
} from './modules/invitations/index';
import { createSearchRouter } from './modules/search/index';
import { createWorkspaceMentionsRouter } from './modules/mentions/index';
import { createWorkspaceDraftsRouter } from './modules/drafts/index';
import {
  createNotificationsRouter,
  createNotificationPreferencesRouter,
} from './modules/notifications/index';
import { createAttachmentsRouter, createMessageAttachmentsRouter } from './modules/storage/index';
import { createWorkspaceThreadsRouter } from './modules/threads/index';
import { createWorkspacesRouter } from './modules/workspaces/index';

/** Optional overrides for tests (e.g. a memory-adapter auth instance). */
export interface AppDeps {
  auth?: AuthContext;
}

/**
 * Application factory (kept separate from `server.ts` so tests can exercise
 * the app without binding a port).
 *
 * Better Auth serves its own endpoints under `/api/auth/*` (sign-up,
 * sign-in, session, …). Application identity lives at `GET /api/me`,
 * derived server-side from the session — never from client input.
 */
export function createApp(deps: AppDeps = {}): Express {
  // Lazy so creating the app never requires auth secrets or database config.
  const resolveAuth = (): AuthContext => deps.auth ?? getAuth();

  const app = express();
  app.disable('x-powered-by');

  // Credentialed CORS first (preflight included). Origins come from
  // CORS_ORIGIN; empty = same-origin only. Never a wildcard with credentials.
  app.use(cors({ origin: getTrustedOrigins(), credentials: true }));

  // Better Auth must run before body-parsing middleware: it reads the raw
  // request stream, which parsers like `express.json()` would consume first.
  app.all('/api/auth/*', (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve()
      .then(() => toNodeHandler(resolveAuth())(req, res))
      .catch(next);
  });

  // 1mb: default 100kb rejects inline avatar data URLs on PATCH /api/me.
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api', createMeRouter(resolveAuth));
  app.use('/api/workspaces', createWorkspacesRouter(resolveAuth));
  app.use('/api/workspaces/:workspaceId/channels', createChannelsRouter(resolveAuth));
  app.use('/api/channels/:channelId/messages', createChannelMessagesRouter(resolveAuth));
  app.use('/api/messages/:messageId/attachments', createMessageAttachmentsRouter(resolveAuth));
  app.use('/api/messages', createMessagesRouter(resolveAuth));
  app.use('/api/attachments', createAttachmentsRouter(resolveAuth));
  app.use(
    '/api/workspaces/:workspaceId/direct-messages',
    createWorkspaceDirectMessagesRouter(resolveAuth),
  );
  app.use('/api/direct-messages', createDirectMessagesRouter(resolveAuth));
  app.use('/api/workspaces/:workspaceId/search', createSearchRouter(resolveAuth));
  app.use('/api/workspaces/:workspaceId/threads', createWorkspaceThreadsRouter(resolveAuth));
  app.use('/api/workspaces/:workspaceId/mentions', createWorkspaceMentionsRouter(resolveAuth));
  app.use('/api/workspaces/:workspaceId/drafts', createWorkspaceDraftsRouter(resolveAuth));
  app.use('/api/workspaces/:workspaceId/notifications', createNotificationsRouter(resolveAuth));
  app.use(
    '/api/users/me/notification-preferences',
    createNotificationPreferencesRouter(resolveAuth),
  );
  app.use(
    '/api/workspaces/:workspaceId/invitations',
    createWorkspaceInvitationsRouter(resolveAuth),
  );
  app.use('/api/invitations', createInvitationAcceptRouter(resolveAuth));

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
