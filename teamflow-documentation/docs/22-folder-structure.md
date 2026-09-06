# Folder Structure

A suggested monorepo:

```text
teamflow/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── public/
│   └── api/
│       └── src/
│           ├── modules/
│           │   ├── auth/
│           │   ├── users/
│           │   ├── workspaces/
│           │   ├── channels/
│           │   ├── messaging/
│           │   ├── realtime/
│           │   ├── notifications/
│           │   ├── files/
│           │   ├── search/
│           │   ├── ai/
│           │   └── audit/
│           ├── middleware/
│           ├── infrastructure/
│           └── server.ts
├── packages/
│   ├── db/
│   ├── shared/
│   └── config/
├── prisma/
├── docs/
├── docker/
├── .github/
├── AGENTS.md
└── README.md
```

Keep domain logic close to its module. Shared packages should contain genuinely shared code, not arbitrary utilities.
