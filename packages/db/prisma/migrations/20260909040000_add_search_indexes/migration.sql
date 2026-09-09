-- Phase 4G.2: PostgreSQL hybrid search infrastructure (FTS + pg_trgm).
--
-- This migration adds ONLY database/index objects. It creates no tables, no
-- views, and no denormalized content stores, so indexes cannot become an
-- authorization shortcut: the future Search service will enforce workspace,
-- channel, and DM-participant predicates at query time.
--
-- body_tsv is a STORED generated column: PostgreSQL maintains it on every
-- INSERT/UPDATE and backfills existing rows. Application code must NOT
-- maintain it. Soft-deleted rows keep stale vectors; this is intentional and
-- harmless because future search queries will require `deletedAt IS NULL`.
--
-- Email is intentionally NOT indexed: account identifiers are not searchable.

-- Trigram support for partial/typo-tolerant matching (message bodies, names).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Generated full-text vector for message bodies (channel, DM, and thread-reply
-- rows alike: every message row carries its own body, so one column covers all
-- containers with no per-container indexing system).
ALTER TABLE "message" ADD COLUMN "body_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("body", ''))) STORED;

-- GIN index for full-text search over message bodies.
CREATE INDEX "message_body_tsv_idx" ON "message" USING GIN ("body_tsv");

-- GIN trigram indexes for partial/typo-tolerant matching.
CREATE INDEX "message_body_trgm_idx" ON "message" USING GIN ("body" gin_trgm_ops);
CREATE INDEX "channel_name_trgm_idx" ON "channel" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "user_name_trgm_idx" ON "user" USING GIN ("name" gin_trgm_ops);
