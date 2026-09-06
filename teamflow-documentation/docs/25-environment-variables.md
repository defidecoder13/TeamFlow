# Environment Variables

Never commit real secrets.

## Web

```text
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_API_URL=
```

## API

```text
NODE_ENV=
PORT=
DATABASE_URL=
CORS_ORIGIN=

# Better Auth (API). Generate a secret locally with `pnpm dlx auth@latest secret`.
BETTER_AUTH_SECRET=
# Base URL of the API, e.g. http://localhost:4000
BETTER_AUTH_URL=
```

## Workers

Workers generally share database/Redis/storage credentials but should receive only the secrets they actually require.

## Rules

- Validate required variables at startup.
- Keep `.env.example` documented.
- Separate public and server-only variables.
- Rotate production credentials if exposed.
