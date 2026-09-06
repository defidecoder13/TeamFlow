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
REDIS_URL=
SESSION_SECRET=
CORS_ORIGIN=
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
OPENAI_API_KEY=
```

## Workers

Workers generally share database/Redis/storage credentials but should receive only the secrets they actually require.

## Rules

- Validate required variables at startup.
- Keep `.env.example` documented.
- Separate public and server-only variables.
- Rotate production credentials if exposed.
