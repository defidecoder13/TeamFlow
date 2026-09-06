# Git Workflow

## Branches

```text
main
develop
feature/*
fix/*
chore/*
```

For a solo portfolio project, `main + feature/*` is sufficient.

## Commits

Prefer focused conventional commits:

```text
feat: add channel messaging
fix: prevent duplicate offline messages
refactor: isolate message authorization
test: cover private channel access
docs: update sync protocol
```

## Pull request checklist

- Scope is focused
- Tests added/updated
- Authorization reviewed
- Database migrations included
- Docs updated if behavior changed
- No secrets
- Build passes

## Commit hygiene

Do not commit generated secrets, `.env` files, database dumps, or private credentials.
