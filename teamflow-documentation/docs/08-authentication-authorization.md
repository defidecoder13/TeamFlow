# Authentication and Authorization

## Authentication

Use secure sessions or a well-managed authentication provider. Cookies should be Secure, HttpOnly, and appropriately SameSite-configured.

## Authorization model

```text
Owner
  -> full workspace control

Admin
  -> member/channel administration

Member
  -> normal collaboration capabilities
```

Authorization is evaluated on the server.

## Permission checks

Every protected operation must establish:

1. authenticated user
2. target workspace
3. workspace membership
4. role/permission
5. channel membership if applicable

## Private channels

Private-channel messages must never be returned by APIs, search, realtime rooms, exports, or AI retrieval to non-members.

## Security requirements

- Passwords must never be stored directly.
- Secrets only in server-side environment variables.
- Rate-limit sensitive endpoints.
- Validate input.
- Prevent IDOR by resolving resources through authorized tenant scope.
- Audit sensitive administrative actions.
