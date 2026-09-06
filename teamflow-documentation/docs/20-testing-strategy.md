# Testing Strategy

## Unit tests

Test pure domain logic:

- permissions
- message validation
- mention parsing
- pagination cursors
- sync conflict rules
- notification rules

## Integration tests

Test:

- database operations
- API authorization
- workspace isolation
- message creation
- sync endpoints
- file metadata

## Realtime tests

Test:

- authenticated connection
- room authorization
- message delivery
- reconnect
- duplicate mutation behavior

## End-to-end

Cover critical flows:

1. Sign in
2. Create workspace
3. Invite member
4. Create channel
5. Send message
6. Reply/react
7. Go offline and queue message
8. Reconnect and sync
9. Search
10. Ask AI about accessible content

## Quality gate

A feature is not done until type checking, linting, relevant automated tests, and production build succeed.
