-- NexusGraph Discovery Engine Migration
-- Adds discovery_jobs and transform_runs tables
-- Expands entity, relationship, and evidence type constraints

-- ─── Expand entity type CHECK ───────────────────────────────────────
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_type_check;
ALTER TABLE entities ADD CONSTRAINT entities_type_check CHECK (type IN (
  'SEED', 'PERSON', 'USERNAME', 'EMAIL', 'DOMAIN', 'URL', 'IP_ADDRESS',
  'ORGANIZATION', 'WEBSITE', 'REPOSITORY', 'SOCIAL_PROFILE', 'TECHNOLOGY',
  'CERTIFICATE', 'DOCUMENT', 'PHONE', 'ADDRESS', 'LOCATION',
  'GITHUB_PROFILE', 'GITLAB_PROFILE', 'YOUTUBE_CHANNEL',
  'SUBDOMAIN', 'MX_RECORD', 'NS_RECORD', 'PUBLIC_MENTION'
));

-- ─── Expand relationship type CHECK ─────────────────────────────────
ALTER TABLE relationships DROP CONSTRAINT IF EXISTS relationships_relationship_type_check;
ALTER TABLE relationships ADD CONSTRAINT relationships_relationship_type_check CHECK (relationship_type IN (
  'USES_USERNAME', 'OWNS_DOMAIN', 'RESOLVES_TO', 'LINKS_TO',
  'MENTIONS', 'HOSTED_ON', 'USES_EMAIL', 'BELONGS_TO',
  'RELATED_TO', 'SAME_AS', 'POSSIBLY_SAME_AS', 'OBSERVED_ON',
  'HAS_WEBSITE', 'HAS_DOMAIN', 'HAS_SOCIAL_PROFILE',
  'HAS_PUBLIC_EMAIL', 'HAS_PUBLIC_PHONE', 'HAS_PUBLIC_ADDRESS',
  'HAS_GITHUB', 'HAS_GITLAB', 'HAS_YOUTUBE'
));

-- ─── Expand evidence source_type CHECK ──────────────────────────────
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_source_type_check;
ALTER TABLE evidence ADD CONSTRAINT evidence_source_type_check CHECK (source_type IN (
  'DNS_RECORD', 'HTTP_RESPONSE', 'TLS_CERTIFICATE', 'GITHUB_API',
  'USERNAME_CHECK', 'MANUAL_INPUT', 'ANALYST_NOTE',
  'WEB_SEARCH', 'SOCIAL_API', 'GITLAB_API', 'YOUTUBE_API',
  'WHOIS_RDAP', 'WEBPAGE_SCRAPE'
));

-- ─── Discovery Jobs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  seed_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  seed_value TEXT NOT NULL,
  seed_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'
  )),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_transforms INTEGER DEFAULT 0,
  completed_transforms INTEGER DEFAULT 0,
  failed_transforms INTEGER DEFAULT 0,
  found_entities INTEGER DEFAULT 0,
  found_relationships INTEGER DEFAULT 0,
  found_evidence INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Transform Runs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transform_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discovery_job_id UUID NOT NULL REFERENCES discovery_jobs(id) ON DELETE CASCADE,
  transform_id TEXT NOT NULL,
  transform_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'NOT_FOUND'
  )),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_count INTEGER DEFAULT 0,
  entities_found INTEGER DEFAULT 0,
  relationships_found INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_case ON discovery_jobs(case_id);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status ON discovery_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transform_runs_job ON transform_runs(discovery_job_id);
CREATE INDEX IF NOT EXISTS idx_transform_runs_status ON transform_runs(status);

-- ─── Row Level Security ─────────────────────────────────────────────

ALTER TABLE discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transform_runs ENABLE ROW LEVEL SECURITY;

-- Discovery jobs: access through case ownership
CREATE POLICY "Users can view discovery jobs in own cases"
  ON discovery_jobs FOR SELECT
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can create discovery jobs in own cases"
  ON discovery_jobs FOR INSERT
  WITH CHECK (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update discovery jobs in own cases"
  ON discovery_jobs FOR UPDATE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete discovery jobs in own cases"
  ON discovery_jobs FOR DELETE
  USING (case_id IN (SELECT id FROM investigations WHERE owner_id = auth.uid()));

-- Transform runs: access through discovery job -> case ownership
CREATE POLICY "Users can view transform runs in own cases"
  ON transform_runs FOR SELECT
  USING (discovery_job_id IN (
    SELECT dj.id FROM discovery_jobs dj
    JOIN investigations i ON dj.case_id = i.id
    WHERE i.owner_id = auth.uid()
  ));

CREATE POLICY "Users can create transform runs in own cases"
  ON transform_runs FOR INSERT
  WITH CHECK (discovery_job_id IN (
    SELECT dj.id FROM discovery_jobs dj
    JOIN investigations i ON dj.case_id = i.id
    WHERE i.owner_id = auth.uid()
  ));

CREATE POLICY "Users can update transform runs in own cases"
  ON transform_runs FOR UPDATE
  USING (discovery_job_id IN (
    SELECT dj.id FROM discovery_jobs dj
    JOIN investigations i ON dj.case_id = i.id
    WHERE i.owner_id = auth.uid()
  ));

CREATE POLICY "Users can delete transform runs in own cases"
  ON transform_runs FOR DELETE
  USING (discovery_job_id IN (
    SELECT dj.id FROM discovery_jobs dj
    JOIN investigations i ON dj.case_id = i.id
    WHERE i.owner_id = auth.uid()
  ));
