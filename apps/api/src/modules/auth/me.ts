/**
 * Application identity route (Clerk migration).
 *
 * GET /api/me returns the Clerk-derived identity of the caller (local user
 * provisioned on first sight). PATCH /api/me updates the caller's own
 * display name / avatar. Sign-up/in/out live with Clerk; no custom
 * login/logout endpoints are created here.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireClerkAuth, type ClerkRouteOptions } from './clerk';
import { getPrisma } from './prisma';
import { toSafeUser } from './session';

const MAX_USER_NAME_LENGTH = 100;
const MAX_IMAGE_URL_LENGTH = 2048;
/** Cap for inline avatar data URLs (base64). Client downscales to ≤512px JPEG. */
export const MAX_DATA_IMAGE_LENGTH = 400_000;

const DATA_IMAGE_PATTERN = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

const userNameSchema = z
  .string({ error: 'Enter a display name.' })
  .trim()
  .min(1, 'Enter a display name.')
  .max(MAX_USER_NAME_LENGTH, `Use a shorter name (${MAX_USER_NAME_LENGTH} characters or fewer).`);

const httpImageUrlSchema = z
  .string({ error: 'Enter a valid image URL.' })
  .trim()
  .url('Enter a valid image URL.')
  .max(MAX_IMAGE_URL_LENGTH, `Image URL must be ${MAX_IMAGE_URL_LENGTH} characters or fewer.`)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a valid image URL.');

const dataImageSchema = z
  .string({ error: 'Enter a valid image.' })
  .max(MAX_DATA_IMAGE_LENGTH, 'Profile photo is too large.')
  .refine((value) => DATA_IMAGE_PATTERN.test(value), 'Enter a valid image.')
  .refine((value) => {
    const comma = value.indexOf(',');
    if (comma === -1) return false;
    const base64 = value.slice(comma + 1);
    return base64.length % 4 === 0;
  }, 'Enter a valid image.');

const imageUrlSchema = z.union([httpImageUrlSchema, dataImageSchema]);

export const updateMeSchema = z
  .object({
    name: userNameSchema.optional(),
    image: z.union([imageUrlSchema, z.null()]).optional(),
  })
  .strict()
  .refine((data) => data.name !== undefined || data.image !== undefined, {
    message: 'Provide a name or image to update.',
  });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}

export function createMeRouter(options: ClerkRouteOptions = {}): Router {
  const router = Router();

  router.get('/me', requireClerkAuth(options), (req: Request, res: Response) => {
    const user = req.authUser;
    if (!user) {
      // Unreachable when requireClerkAuth is wired correctly; kept as a
      // defense-in-depth guard so identity can never be undefined.
      res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
      return;
    }
    res.status(200).json({ user });
  });

  router.patch('/me', requireClerkAuth(options), async (req: Request, res: Response) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: firstValidationMessage(parsed.error) },
      });
      return;
    }
    const authUser = req.authUser;
    if (!authUser) {
      res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
      return;
    }
    const prisma = getPrisma();
    const data: { name?: string; image?: string | null } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.image !== undefined) data.image = parsed.data.image;
    try {
      const updated = await prisma.user.update({
        where: { id: authUser.id },
        data,
        select: { id: true, name: true, email: true, image: true, emailVerified: true },
      });
      res.status(200).json({ user: toSafeUser(updated) });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2025'
      ) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
        return;
      }
      throw error;
    }
  });

  return router;
}
