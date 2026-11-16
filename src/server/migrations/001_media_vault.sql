-- NEXUS X OS Migration 001: Media Vault, Render Jobs, Audit Logs & RBAC
-- Single source of truth schema matching TypeScript interfaces & OpenAPI 3.1

CREATE TABLE IF NOT EXISTS workspace_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  default_aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES workspace_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
  invited_by TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS factory_assets (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL DEFAULT 'th-main-001',
  line TEXT NOT NULL CHECK (line IN ('video', 'ad', 'funnel')),
  title TEXT NOT NULL,
  prompt TEXT,
  body TEXT NOT NULL,
  meta TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('queued', 'rendering', 'ready', 'failed')),
  mime_type TEXT NOT NULL DEFAULT 'video/mp4',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_sec NUMERIC(8,2) NOT NULL DEFAULT 6.0,
  resolution TEXT NOT NULL DEFAULT '720x1280',
  sha256 TEXT,
  file_path TEXT,
  stream_url TEXT,
  download_url TEXT,
  moviepy_script TEXT,
  video_storyboard JSONB,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factory_assets_thread ON factory_assets(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_factory_assets_status ON factory_assets(status, line);

CREATE TABLE IF NOT EXISTS media_jobs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES factory_assets(id) ON DELETE CASCADE,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
