import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { getTrustedOrigins } from './cors';
import { createMeRouter, type ClerkRouteOptions } from './modules/auth/index';
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

/** Optional overrides for tests (fake Clerk verifier/directory). */
export interface AppDeps {
  verify?: ClerkRouteOptions['verify'];
  directory?: ClerkRouteOptions['directory'];
}

/**
 * Application factory (kept separate from `server.ts` so tests can exercise
 * the app without binding a port).
 *
 * Authentication is verified Clerk sessions (`Authorization: Bearer`).
 * Application identity lives at `GET /api/me`, derived server-side from the
 * verified token with first-sight provisioning — never from client input.
 */
export function createApp(deps: AppDeps = {}): Express {
  const options: ClerkRouteOptions = { verify: deps.verify, directory: deps.directory };

  const app = express();
  app.disable('x-powered-by');

  // Credentialed CORS first (preflight included). Origins come from
  // CORS_ORIGIN; empty = same-origin only. Never a wildcard with credentials.
  app.use(cors({ origin: getTrustedOrigins(), credentials: true }));

  // 1mb: default 100kb rejects inline avatar data URLs on PATCH /api/me.
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api', createMeRouter(options));
  app.use('/api/workspaces', createWorkspacesRouter(options));
  app.use('/api/workspaces/:workspaceId/channels', createChannelsRouter(options));
  app.use('/api/channels/:channelId/messages', createChannelMessagesRouter(options));
  app.use('/api/messages/:messageId/attachments', createMessageAttachmentsRouter(options));
  app.use('/api/messages', createMessagesRouter(options));
  app.use('/api/attachments', createAttachmentsRouter(options));
  app.use(
    '/api/workspaces/:workspaceId/direct-messages',
    createWorkspaceDirectMessagesRouter(options),
  );
  app.use('/api/direct-messages', createDirectMessagesRouter(options));
  app.use('/api/workspaces/:workspaceId/search', createSearchRouter(options));
  app.use('/api/workspaces/:workspaceId/threads', createWorkspaceThreadsRouter(options));
  app.use('/api/workspaces/:workspaceId/mentions', createWorkspaceMentionsRouter(options));
  app.use('/api/workspaces/:workspaceId/drafts', createWorkspaceDraftsRouter(options));
  app.use('/api/workspaces/:workspaceId/notifications', createNotificationsRouter(options));
  app.use(
    '/api/users/me/notification-preferences',
    createNotificationPreferencesRouter(options),
  );
  app.use(
    '/api/workspaces/:workspaceId/invitations',
    createWorkspaceInvitationsRouter(options),
  );
  app.use('/api/invitations', createInvitationAcceptRouter(options));

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
