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
    id: 'contact.find-official-contact',
    name: 'Official Contact Information',
    description: 'Extract official public contact details (email, phone) from organization websites',
    inputTypes: ['WEBSITE', 'URL', 'DOMAIN'],
    outputTypes: ['EMAIL', 'PHONE', 'ADDRESS', 'LOCATION'],
    category: 'contact',
    riskLevel: 'low',
    enabled: true,
  },

  // ─── Intelligence Transforms ────────────────────────────────────────
  {
    id: 'mentions.search-public-web',
    name: 'Public Web Mentions',
    description: 'Search for public mentions and references across the web',
    inputTypes: ['ORGANIZATION', 'USERNAME', 'DOMAIN', 'PERSON'],
    outputTypes: ['PUBLIC_MENTION', 'URL', 'WEBSITE'],
    category: 'intelligence',
    riskLevel: 'low',
    enabled: true,
  },
];
