/**
 * Transform Definitions — static metadata for all available transforms.
 * Each transform wraps one or more existing collectors.
 */

import type { TransformDefinition } from '@nexusgraph/shared';

export const TRANSFORM_DEFINITIONS: TransformDefinition[] = [
  // ─── Web Transforms ─────────────────────────────────────────────────
  {
    id: 'web.discover-official-site',
    name: 'Discover Official Website',
    description: 'Search for official website associated with an organization or name using public web search',
    inputTypes: ['ORGANIZATION', 'PERSON'],
    outputTypes: ['WEBSITE', 'URL', 'DOMAIN'],
    category: 'web',
    riskLevel: 'low',
    enabled: true,
  },

  // ─── Domain/Infrastructure Transforms ───────────────────────────────
  {
    id: 'domain.resolve-dns',
    name: 'DNS Resolution',
    description: 'Resolve A, AAAA, MX, NS, TXT, CNAME records for a domain',
    inputTypes: ['DOMAIN', 'WEBSITE', 'SUBDOMAIN'],
    outputTypes: ['IP_ADDRESS', 'MX_RECORD', 'NS_RECORD', 'SUBDOMAIN'],
    category: 'infrastructure',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'domain.find-subdomains-crt',
    name: 'Subdomain Enumeration (crt.name)',
    description: 'Enumerate subdomains of an apex domain from public Certificate Transparency logs via crt.name',
    inputTypes: ['DOMAIN', 'WEBSITE', 'URL', 'ORGANIZATION'],
    outputTypes: ['SUBDOMAIN', 'DOMAIN'],
    category: 'infrastructure',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'domain.find-tls',
    name: 'TLS Certificate Lookup',
    description: 'Find TLS certificates and Subject Alternative Names via Certificate Transparency logs',
    inputTypes: ['DOMAIN', 'SUBDOMAIN'],
    outputTypes: ['CERTIFICATE', 'SUBDOMAIN', 'DOMAIN'],
    category: 'infrastructure',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'domain.webpage-metadata',
    name: 'Webpage Metadata Extraction',
    description: 'Extract page title, headers, social links, contact info, and technology stack from a URL',
    inputTypes: ['URL', 'WEBSITE', 'DOMAIN'],
    outputTypes: ['EMAIL', 'SOCIAL_PROFILE', 'TECHNOLOGY', 'PHONE'],
    category: 'web',
    riskLevel: 'low',
    enabled: true,
  },

  // ─── Social Transforms ──────────────────────────────────────────────
  {
    id: 'social.discover-public-profiles',
    name: 'Public Social Profile Discovery',
    description: 'Check for public profile existence across major platforms',
    inputTypes: ['USERNAME'],
    outputTypes: ['SOCIAL_PROFILE', 'USERNAME'],
    category: 'social',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'social.youtube-channel',
    name: 'YouTube Channel Discovery',
    description: 'Find public YouTube channels matching organization or username',
    inputTypes: ['USERNAME', 'ORGANIZATION'],
    outputTypes: ['YOUTUBE_CHANNEL', 'URL'],
    category: 'social',
    riskLevel: 'low',
    enabled: true,
  },

  // ─── Developer Platform Transforms ──────────────────────────────────
  {
    id: 'developer.github-profile',
    name: 'GitHub Profile Discovery',
    description: 'Find public GitHub user/organization profiles, repositories, and associated metadata',
    inputTypes: ['USERNAME', 'ORGANIZATION', 'EMAIL'],
    outputTypes: ['GITHUB_PROFILE', 'REPOSITORY', 'EMAIL', 'URL', 'ORGANIZATION'],
    category: 'developer',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'developer.gitlab-profile',
    name: 'GitLab Profile Discovery',
    description: 'Find public GitLab user profiles and repositories',
    inputTypes: ['USERNAME', 'ORGANIZATION'],
    outputTypes: ['GITLAB_PROFILE', 'REPOSITORY', 'URL'],
    category: 'developer',
    riskLevel: 'low',
    enabled: true,
  },

  // ─── Contact Transforms ─────────────────────────────────────────────
  {
    id: 'phone.geo-metadata',
    name: 'Phone Number Geolocation',
    description: 'Parse an international phone number (E.164) and attribute its registered country region as coordinates',
    inputTypes: ['PHONE'],
    outputTypes: ['PHONE', 'LOCATION'],
    category: 'contact',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'contact.find-official-contact',
    name: 'Official Contact Information',
    description: 'Extract official public contact details (email, phone) from organization websites',
    inputTypes: ['WEBSITE', 'URL', 'DOMAIN'],
    outputTypes: ['EMAIL', 'PHONE', 'ADDRESS', 'LOCATION'],
    category: 'contact',
    riskLevel: 'low',
    enabled: true,
  },

  {
    id: 'social.username-sweep',
    name: 'Mr.Holmes Username Sweep',
    description: 'Sweep a username across 150+ platforms ported from Mr.Holmes (status, message and redirect based detection)',
    inputTypes: ['USERNAME'],
    outputTypes: ['SOCIAL_PROFILE', 'URL'],
    category: 'social',
    riskLevel: 'medium',
    enabled: true,
  },
  {
    id: 'intelligence.generate-dorks',
    name: 'Mr.Holmes Website Dork Generator',
    description: 'Generate deterministic Google/Yandex site-scoped dork URLs (filetype, intext, inurl) for domain and website investigations',
    inputTypes: ['DOMAIN', 'URL'],
    outputTypes: ['URL', 'PUBLIC_MENTION'],
    category: 'intelligence',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'contact.email-breach-lookup',
    name: 'Mr.Holmes Email Lookup',
    description: 'Find GitHub accounts listing the email publicly, check Gravatar existence, and persist breach-lookup reference links',
    inputTypes: ['EMAIL'],
    outputTypes: ['GITHUB_PROFILE', 'SOCIAL_PROFILE', 'URL'],
    category: 'contact',
    riskLevel: 'medium',
    enabled: true,
  },
  {
    id: 'domain.website-recon',
    name: 'Mr.Holmes Website Recon',
    description: 'Fetch robots.txt rules, resolve hosting IP with geolocation, and persist reputation-check reference links',
    inputTypes: ['DOMAIN', 'WEBSITE', 'URL'],
    outputTypes: ['DOCUMENT', 'LOCATION', 'IP_ADDRESS', 'URL'],
    category: 'infrastructure',
    riskLevel: 'medium',
    enabled: true,
  },

  {
    id: 'social.mrholmes-engine',
    name: 'Mr.Holmes Python Engine',
    description: 'Run the original vendored Mr.Holmes Python engine — SOCIAL-ACCOUNT-OSINT for usernames and PEOPLE-OSINT for names (150+ platforms)',
    inputTypes: ['USERNAME', 'PERSON'],
    outputTypes: ['SOCIAL_PROFILE', 'URL'],
    category: 'social',
    riskLevel: 'medium',
    enabled: true,
  },
  {
    id: 'contact.mrholmes-phone',
    name: 'Mr.Holmes Phone OSINT',
    description: 'Run the original Mr.Holmes PHONE-NUMBER-OSINT category: carrier, approximate geolocation coordinates (Nominatim OSM), timezones, and dorks',
    inputTypes: ['PHONE'],
    outputTypes: ['LOCATION', 'URL'],
    category: 'contact',
    riskLevel: 'low',
    enabled: true,
  },

  // ─── Intelligence Transforms ────────────────────────────────────────
  {
    id: 'mentions.search-public-web',
    name: 'Public Web Mentions',
    description: 'Search for public mentions and references across the web',
    inputTypes: ['DOMAIN', 'IP_ADDRESS', 'URL', 'ORGANIZATION'],
    outputTypes: ['PUBLIC_MENTION', 'URL', 'WEBSITE'],
    category: 'intelligence',
    riskLevel: 'low',
    enabled: true,
  },
];
