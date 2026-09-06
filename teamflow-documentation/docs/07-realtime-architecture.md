# Realtime Architecture

## Transport

Use Socket.IO over WebSocket with fallback transport when appropriate.

## Connection lifecycle

```text
connect
 -> authenticate
 -> authorize workspace access
 -> join permitted rooms
 -> heartbeat
 -> receive events
 -> reconnect on failure
```

## Rooms

- `workspace:{workspaceId}`
- `channel:{channelId}`
- `dm:{conversationId}`
- `user:{userId}`

Never allow a client to join an arbitrary room without server-side authorization.

## Message flow

```text
Client
 -> socket event
 -> validate/authenticate
 -> authorize channel
 -> persist transaction
 -> publish event
 -> broadcast
 -> acknowledge sender
```

## Events

```text
message:new
message:updated
message:deleted
reaction:added
reaction:removed
typing:start
typing:stop
presence:changed
notification:new
```

## Multi-instance scaling

Use a Redis-backed Socket.IO adapter/PubSub layer so events can cross backend instances.

## Reconnection

Clients reconnect automatically, then request missed changes using a sync cursor. Do not assume websocket delivery is durable.
