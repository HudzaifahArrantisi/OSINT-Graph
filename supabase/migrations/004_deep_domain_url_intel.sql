-- NexusGraph Deep Domain & URL Intelligence Migration
-- Expands evidence source_type CHECK constraint to support enterprise-grade
-- domain/URL intelligence collectors: Subdomain Takeover, DNS Security Audit,
-- Web Technology Fingerprinting, and Sensitive Parameter Analysis.

-- ─── Expand evidence source_type CHECK ──────────────────────────────
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_source_type_check;
ALTER TABLE evidence ADD CONSTRAINT evidence_source_type_check CHECK (source_type IN (
  'DNS_RECORD', 'HTTP_RESPONSE', 'TLS_CERTIFICATE', 'GITHUB_API',
  'USERNAME_CHECK', 'MANUAL_INPUT', 'ANALYST_NOTE',
  'WEB_SEARCH', 'SOCIAL_API', 'GITLAB_API', 'YOUTUBE_API',
  'WHOIS_RDAP', 'WEBPAGE_SCRAPE', 'PHONE_METADATA',
  'DORK_TEMPLATE', 'ROBOTS_TXT', 'EMAIL_LOOKUP', 'IP_GEOLOCATION',
  'SUBDOMAIN_ENUM', 'SHODAN_HOST', 'JS_ENDPOINT_ANALYSIS',
  'WAYBACK_ARCHIVE', 'SECURITY_TXT', 'SITEMAP_XML', 'REVERSE_IP_LOOKUP',
  'FAVICON_HASH', 'SUBDOMAIN_TAKEOVER', 'DNS_SECURITY_AUDIT',
  'TECH_FINGERPRINT', 'SENSITIVE_PARAM_ANALYSIS'
));
