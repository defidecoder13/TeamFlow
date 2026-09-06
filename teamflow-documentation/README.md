# TeamFlow

TeamFlow is a production-oriented, Slack-like collaboration platform for teams. It combines real-time messaging, workspaces, channels, direct messages, file sharing, search, notifications, offline-first behavior, and an AI workspace assistant.

## Product goal

Build a technically credible collaboration platform that demonstrates full-stack engineering, real-time systems, authorization, offline synchronization, background processing, search, AI/RAG, scalability, security, testing, and deployment.

## Architecture principle

Start as a **modular monolith**. Keep strong module boundaries so high-load components can later be extracted into services without rewriting the product.

## Core stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand
- Backend: Node.js, Express, TypeScript, Socket.IO
- Database: PostgreSQL, Prisma, Neon
- Realtime/scaling: Redis, Socket.IO adapter/Pub/Sub
- Jobs: BullMQ + Redis
- Offline: PWA, Service Worker, IndexedDB, Dexie
- Storage: Cloudflare R2 or AWS S3
- AI: OpenAI API, embeddings, pgvector, RAG
- Infrastructure: Docker, CI/CD, Vercel + backend hosting

## Documentation map

See `docs/` for the authoritative specifications. `AGENTS.md` contains rules for AI coding agents.
