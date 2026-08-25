-- NexusGraph Phone Geo Tracking Migration
-- Adds PHONE_METADATA to evidence source_type constraint for the
-- phone-geo collector (phone number tracking with country-level geolocation).

-- ─── Expand evidence source_type CHECK ──────────────────────────────
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_source_type_check;
ALTER TABLE evidence ADD CONSTRAINT evidence_source_type_check CHECK (source_type IN (
  'DNS_RECORD', 'HTTP_RESPONSE', 'TLS_CERTIFICATE', 'GITHUB_API',
  'USERNAME_CHECK', 'MANUAL_INPUT', 'ANALYST_NOTE',
  'WEB_SEARCH', 'SOCIAL_API', 'GITLAB_API', 'YOUTUBE_API',
  'WHOIS_RDAP', 'WEBPAGE_SCRAPE', 'PHONE_METADATA'
));
