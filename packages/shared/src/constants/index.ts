// Entity type enumeration — all supported entity kinds in the graph
export const ENTITY_TYPES = [
  'SEED',
  'PERSON',
  'USERNAME',
  'EMAIL',
  'DOMAIN',
  'URL',
  'IP_ADDRESS',
  'ORGANIZATION',
  'WEBSITE',
  'REPOSITORY',
  'SOCIAL_PROFILE',
  'TECHNOLOGY',
  'CERTIFICATE',
  'DOCUMENT',
  'PHONE',
  'ADDRESS',
  'LOCATION',
  'GITHUB_PROFILE',
  'GITLAB_PROFILE',
  'YOUTUBE_CHANNEL',
  'SUBDOMAIN',
  'MX_RECORD',
  'NS_RECORD',
  'PUBLIC_MENTION',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

// Relationship type enumeration
export const RELATIONSHIP_TYPES = [
  'USES_USERNAME',
  'OWNS_DOMAIN',
  'RESOLVES_TO',
  'LINKS_TO',
  'MENTIONS',
  'HOSTED_ON',
  'USES_EMAIL',
  'BELONGS_TO',
  'RELATED_TO',
  'SAME_AS',
  'POSSIBLY_SAME_AS',
  'OBSERVED_ON',
  'HAS_WEBSITE',
  'HAS_DOMAIN',
  'HAS_SOCIAL_PROFILE',
  'HAS_PUBLIC_EMAIL',
  'HAS_PUBLIC_PHONE',
  'HAS_PUBLIC_ADDRESS',
  'HAS_GITHUB',
  'HAS_GITLAB',
  'HAS_YOUTUBE',
  'GEOLOCATED_IN',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

// Investigation status
export const INVESTIGATION_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'CLOSED'] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

// Investigation priority
export const INVESTIGATION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type InvestigationPriority = (typeof INVESTIGATION_PRIORITIES)[number];

// Seed input types
export const SEED_TYPES = [
  'USERNAME',
  'EMAIL',
  'DOMAIN',
  'IP_ADDRESS',
  'URL',
  'ORGANIZATION',
  'SOCIAL_PROFILE',
  'PERSON',
  'NAME',
  'PHONE',
] as const;

export type SeedType = (typeof SEED_TYPES)[number];

export const SEED_PLACEHOLDERS: Record<SeedType, string> = {
  USERNAME: 'e.g. johndoe_sec, target_handle',
  EMAIL: 'e.g. security@company.com, admin@target.org',
  DOMAIN: 'e.g. example.com, target-domain.org',
  IP_ADDRESS: 'e.g. 93.184.216.34 or 2606:2800:220:1:248:1893:25c8:1946',
  URL: 'e.g. https://example.com/target, https://sub.target.org/page',
  ORGANIZATION: 'e.g. Acme Corp, OWASP Foundation, Nurul Fikri',
  SOCIAL_PROFILE: 'e.g. https://github.com/torvalds, https://x.com/target',
  PERSON: 'e.g. Johnathan Doe, Sarah Connor',
  NAME: 'e.g. John Doe, Alice Smith',
  PHONE: 'e.g. +6281234567890, +1-555-0199',
};

// Collector run status
export const COLLECTOR_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type CollectorStatus = (typeof COLLECTOR_STATUSES)[number];

// Transform execution status
export const TRANSFORM_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'NOT_FOUND',
] as const;

export type TransformStatus = (typeof TRANSFORM_STATUSES)[number];

// Discovery job status
export const DISCOVERY_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
] as const;

export type DiscoveryJobStatus = (typeof DISCOVERY_JOB_STATUSES)[number];

// Confidence levels for UI display
export const CONFIDENCE_LEVELS = {
  VERY_HIGH: { min: 90, max: 100, label: 'Very High', color: 'success' },
  HIGH: { min: 75, max: 89, label: 'High', color: 'cyan' },
  MEDIUM: { min: 50, max: 74, label: 'Medium', color: 'warning' },
  LOW: { min: 25, max: 49, label: 'Low', color: 'muted' },
  VERY_LOW: { min: 0, max: 24, label: 'Very Low', color: 'danger' },
} as const;

export function getConfidenceLevel(score: number) {
  if (score >= 90) return CONFIDENCE_LEVELS.VERY_HIGH;
  if (score >= 75) return CONFIDENCE_LEVELS.HIGH;
  if (score >= 50) return CONFIDENCE_LEVELS.MEDIUM;
  if (score >= 25) return CONFIDENCE_LEVELS.LOW;
  return CONFIDENCE_LEVELS.VERY_LOW;
}

// Confidence scoring factors
export const CONFIDENCE_FACTORS = {
  EXACT_MATCH: 40,
  DIRECT_PUBLIC_REFERENCE: 30,
  MULTIPLE_INDEPENDENT_SOURCES: 20,
  TEMPORAL_CONSISTENCY: 10,
  CONTRADICTING_EVIDENCE: -30,
  WEAK_SIMILARITY: -10,
} as const;

// Evidence source types
export const EVIDENCE_SOURCE_TYPES = [
  'DNS_RECORD',
  'HTTP_RESPONSE',
  'TLS_CERTIFICATE',
  'GITHUB_API',
  'USERNAME_CHECK',
  'MANUAL_INPUT',
  'ANALYST_NOTE',
  'WEB_SEARCH',
  'SOCIAL_API',
  'GITLAB_API',
  'YOUTUBE_API',
  'WHOIS_RDAP',
  'WEBPAGE_SCRAPE',
  'PHONE_METADATA',
  'DORK_TEMPLATE',
  'ROBOTS_TXT',
  'EMAIL_LOOKUP',
  'IP_GEOLOCATION',
  'SUBDOMAIN_ENUM',
  'SHODAN_HOST',
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

// Collector names
export const COLLECTOR_NAMES = [
  'dns',
  'url-metadata',
  'tls-certificate',
  'github-public',
  'username-presence',
  'gitlab-public',
  'youtube-public',
  'web-search',
  'phone-geo',
  'username-sweep',
  'dork-generator',
  'email-lookup',
  'website-recon',
  'mrholmes-engine',
  'subdomain-crt',
  'whois-rdap',
  'ip-geolocation',
  'social-rapidapi',
  'shodan-recon',
] as const;

export type CollectorName = (typeof COLLECTOR_NAMES)[number];

// Transform categories
export const TRANSFORM_CATEGORIES = [
  'web',
  'domain',
  'social',
  'developer',
  'infrastructure',
  'contact',
  'intelligence',
] as const;

export type TransformCategory = (typeof TRANSFORM_CATEGORIES)[number];

// Rate limits
export const RATE_LIMITS = {
  COLLECTOR_PER_HOUR: 20,
  LARGE_COLLECTOR_PER_HOUR: 5,
  DISCOVERY_PER_HOUR: 10,
} as const;

// SSRF-blocked IP ranges (CIDR notation for reference)
export const BLOCKED_IP_RANGES = [
  '127.0.0.0/8', // Loopback
  '10.0.0.0/8', // Private
  '172.16.0.0/12', // Private
  '192.168.0.0/16', // Private
  '169.254.0.0/16', // Link-local
  '0.0.0.0/8', // Current network
  '100.64.0.0/10', // Shared address space (CGNAT)
  '192.0.0.0/24', // IETF Protocol Assignments
  '192.0.2.0/24', // TEST-NET-1
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // Multicast
  '240.0.0.0/4', // Reserved
  '255.255.255.255/32', // Broadcast
  'fc00::/7', // IPv6 ULA
  '::1/128', // IPv6 loopback
  'fe80::/10', // IPv6 link-local
  'ff00::/8', // IPv6 multicast
] as const;

// Cloud metadata service IPs that must be blocked for SSRF protection
export const METADATA_SERVICE_IPS = [
  '169.254.169.254', // AWS, GCP, Azure
  '169.254.170.2', // AWS ECS
  '100.100.100.200', // Alibaba Cloud
  'fd00:ec2::254', // AWS IMDSv2 IPv6
] as const;
