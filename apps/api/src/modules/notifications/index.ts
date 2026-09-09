/**
 * Notifications module boundary (Phases 4H.4–4H.5).
 *
 * Generation derives rows post-commit from authoritative state; the read API
 * lists, marks read, and marks all read for the caller's own notifications.
 * Rows are created exclusively by post-commit generation — nothing in the
 * read path writes new notifications.
 */

export { createNotificationsRouter } from './routes';
export { createNotificationPreferencesRouter } from './preferences.routes';
export { decodeNotificationCursor, encodeNotificationCursor } from './cursor';
export {
  generateNotificationsForMessage,
  generateNotificationsForMessageSafely,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationGenerationError,
  NotificationNotFoundError,
  NotificationValidationError,
  type NotificationItem,
  type NotificationPage,
} from './service';
export {
  getNotificationPreferences,
  updateNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type UserNotificationPreferencesResponse,
} from './preferences.service';
export {
  firstValidationMessage,
  notificationListQuerySchema,
  notificationTypeSchema,
  type NotificationListQuery,
} from './schemas';
export {
  notificationDeliverySchema,
  updateNotificationPreferencesSchema,
  type UpdateNotificationPreferencesInput,
} from './preferences.schemas';
