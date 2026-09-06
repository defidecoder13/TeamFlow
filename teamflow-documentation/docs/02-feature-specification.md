# Feature Specification

## Workspace

A workspace is the tenant boundary. Every channel, membership, message, attachment, and AI retrieval operation must resolve to a workspace.

## Channels

A channel has a unique name within a workspace. Public channels are discoverable by workspace members; private channels require explicit membership.

## Messages

Messages have durable IDs, author, channel/DM context, timestamps, edit/delete metadata, and optional client mutation IDs.

### Message states

- pending
- sent
- failed
- edited
- deleted

## Threads

A reply references a root message. Thread replies inherit the authorization scope of the parent channel/DM.

## Mentions

The parser identifies users and produces notification events. Unknown or unauthorized mentions are not resolved.

## Notifications

Notifications are generated for relevant events and stored for durable unread state. Push/browser delivery is best-effort.

## Files

Attachments are metadata records linked to object-storage objects. The API never trusts client-provided MIME type or size.

## Search

Search must filter by tenant and authorization before returning results.

## AI assistant

AI is an assistant over authorized workspace knowledge, not an unrestricted database interface.
