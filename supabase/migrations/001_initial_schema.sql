-- NexusGraph Initial Schema
-- Run this in your Supabase SQL editor or as a migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Profiles ───────────────────────────────────────────────────────
-- Auto-created when a user signs up via trigger

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Investigations (Cases) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investigations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED', 'CLOSED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Entities ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'PERSON', 'USERNAME', 'EMAIL', 'DOMAIN', 'URL', 'IP_ADDRESS',
    'ORGANIZATION', 'REPOSITORY', 'SOCIAL_PROFILE', 'TECHNOLOGY',
    'CERTIFICATE', 'DOCUMENT'
  )),
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Relationships ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'USES_USERNAME', 'OWNS_DOMAIN', 'RESOLVES_TO', 'LINKS_TO',
    'MENTIONS', 'HOSTED_ON', 'USES_EMAIL', 'BELONGS_TO',
    'RELATED_TO', 'SAME_AS', 'POSSIBLY_SAME_AS', 'OBSERVED_ON'
  )),
  confidence NUMERIC NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Evidence ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  relationship_id UUID REFERENCES relationships(id) ON DELETE SET NULL,
  source_url TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'DNS_RECORD', 'HTTP_RESPONSE', 'TLS_CERTIFICATE', 'GITHUB_API',
    'USERNAME_CHECK', 'MANUAL_INPUT', 'ANALYST_NOTE'
  )),
  title TEXT,
  extracted_value TEXT,
  collector TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash TEXT,
  notes TEXT,
  confidence NUMERIC NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Timeline Events ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  relationship_id UUID REFERENCES relationships(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_at TIMESTAMPTZ NOT NULL,
  source_evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Notes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  relationship_id UUID REFERENCES relationships(id) ON DELETE SET NULL,
  evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Collector Runs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collector_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  collector TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  request_id TEXT,
  input_type TEXT,
  input_summary TEXT,
  result_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  error_message TEXT
);

-- ─── Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_investigations_owner ON investigations(owner_id);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);

CREATE INDEX IF NOT EXISTS idx_entities_case ON entities(case_id);
CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities(normalized_value);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(case_id, type);
CREATE INDEX IF NOT EXISTS idx_entities_case_normalized ON entities(case_id, normalized_value);

CREATE INDEX IF NOT EXISTS idx_relationships_case ON relationships(case_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);

CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence(entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_relationship ON evidence(relationship_id);

CREATE INDEX IF NOT EXISTS idx_timeline_case_time ON timeline_events(case_id, event_at);

CREATE INDEX IF NOT EXISTS idx_notes_case ON notes(case_id);
CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_id);

CREATE INDEX IF NOT EXISTS idx_collector_runs_case ON collector_runs(case_id);

-- ─── Profile auto-creation trigger ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security ─────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_runs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Investigations: full CRUD on owned investigations
CREATE POLICY "Users can view own investigations"
  ON investigations FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create investigations"
  ON investigations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own investigations"
  ON investigations FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own investigations"
  ON investigations FOR DELETE
  USING (auth.uid() = owner_id);

-- Entities: access through case ownership
CREATE POLICY "Users can view entities in own cases"
  ON entities FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create entities in own cases"
  ON entities FOR INSERT
  WITH CHECK (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update entities in own cases"
  ON entities FOR UPDATE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete entities in own cases"
  ON entities FOR DELETE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

-- Relationships: access through case ownership
CREATE POLICY "Users can view relationships in own cases"
  ON relationships FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create relationships in own cases"
  ON relationships FOR INSERT
  WITH CHECK (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update relationships in own cases"
  ON relationships FOR UPDATE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete relationships in own cases"
  ON relationships FOR DELETE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

-- Evidence: access through case ownership
CREATE POLICY "Users can view evidence in own cases"
  ON evidence FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create evidence in own cases"
  ON evidence FOR INSERT
  WITH CHECK (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update evidence in own cases"
  ON evidence FOR UPDATE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete evidence in own cases"
  ON evidence FOR DELETE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

-- Timeline: access through case ownership
CREATE POLICY "Users can view timeline in own cases"
  ON timeline_events FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create timeline in own cases"
  ON timeline_events FOR INSERT
  WITH CHECK (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

-- Notes: access through case ownership + author check for mutation
CREATE POLICY "Users can view notes in own cases"
  ON notes FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create notes in own cases"
  ON notes FOR INSERT
  WITH CHECK (
    case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid())
    AND auth.uid() = author_id
  );

CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE
  USING (auth.uid() = author_id);

-- Collector runs: access through case ownership
CREATE POLICY "Users can view collector runs in own cases"
  ON collector_runs FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create collector runs in own cases"
  ON collector_runs FOR INSERT
  WITH CHECK (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update collector runs in own cases"
  ON collector_runs FOR UPDATE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));
