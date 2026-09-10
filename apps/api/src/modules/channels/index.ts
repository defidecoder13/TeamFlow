/**
 * Channels module boundary (Phase 3A: workspace channels foundation).
 *
 * Channel CRUD over workspace-scoped slugs with PUBLIC/PRIVATE visibility
 * and channel membership. Messages, threads, realtime, and search build on
 * this in later phases — not here.
 */

export { createChannelsRouter } from './routes';
export { canUpdateChannel, getAccessibleChannel } from './authorization';
export {
  ChannelForbiddenError,
  ChannelMembershipConflictError,
  ChannelMembershipNotFoundError,
  ChannelNotFoundError,
  ChannelSlugConflictError,
  ChannelValidationError,
  addChannelMember,
  createChannel,
  listAccessibleChannels,
  listChannelMembers,
  removeChannelMember,
  updateChannel,
  type ChannelMember,
  type ChannelResponse,
} from './service';
