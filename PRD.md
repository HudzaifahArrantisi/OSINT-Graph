# PRD.md

# OSINT Investigation Graph

**Product Name:** NexusGraph (working title)  
**Product Type:** OSINT investigation and public digital-footprint correlation platform  
**Document Version:** 1.0  
**Status:** MVP Planning  
**Primary Language:** TypeScript  
**Frontend:** React + Vite  
**Backend:** Hono on Cloudflare Workers  
**Database:** Supabase PostgreSQL  
**Graph UI:** React Flow (`@xyflow/react`)  

---

## 1. Product Vision

NexusGraph is a lightweight OSINT investigation workspace that turns publicly available digital artifacts into an interactive relationship graph.

The core idea is not simply to search for a username, email, domain, or IP. The product collects public evidence, normalizes it into entities, correlates related entities, and presents the result as a visual investigation graph.

### Vision statement

> Turn fragmented public digital traces into an explainable investigation graph.

---

## 2. Problem

OSINT work often requires moving between many sources and manually connecting observations.

Typical workflow:

```text
Username
   ↓
Search engine
   ↓
GitHub
   ↓
Social profile
   ↓
Website
   ↓
DNS / WHOIS
   ↓
Notes
   ↓
Spreadsheet
   ↓
Manual relationship mapping
```

This becomes difficult when an investigation contains dozens or hundreds of artifacts.

NexusGraph solves the organization and correlation problem by providing:

- a single investigation workspace
- normalized entities
- evidence records
- relationships between entities
- source attribution
- confidence scoring
- graph visualization
- timeline view
- exportable investigation reports

---

## 3. Important Scope Boundary

The platform is designed for legitimate OSINT, security research, incident response, fraud analysis, journalism, defensive security, and self-audit.

The MVP must focus on **publicly available or user-provided data**.

The product must not include features intended to:

- bypass authentication
- access private accounts
- obtain private location data
- exploit vulnerabilities against third parties
- deanonymize a private individual solely for harassment or stalking
- automate unauthorized account access

Every source record should retain provenance and collection time.

---

## 4. Target Users

### 4.1 Cybersecurity Student

Needs:

- learn OSINT methodology
- visualize relationships
- document investigations
- generate reports

### 4.2 Security Researcher / Bug Bounty Researcher

Needs:

- enumerate public assets
- correlate domains, IPs, emails, repositories, and technologies
- maintain investigation cases

### 4.3 SOC / Threat Intelligence Analyst

Needs:

- investigate suspicious indicators
- connect IOCs
- preserve evidence and source URLs
- identify infrastructure clusters

### 4.4 Fraud / Scam Analyst

Needs:

- correlate public scam indicators
- group domains, usernames, emails, phone numbers, and other public identifiers
- build evidence-backed timelines

### 4.5 Individual / Self-Audit User

Needs:

- discover their own public digital footprint
- understand exposed public information
- get remediation recommendations

---

## 5. Product Goals

### Primary Goals

1. Create investigations in seconds.
2. Add OSINT entities and evidence quickly.
3. Automatically create explicit, explainable relationships.
4. Visualize investigations as an interactive graph.
5. Allow analysts to distinguish facts from hypotheses.
6. Preserve source provenance.
7. Export a clean investigation report.
8. Keep the MVP lightweight enough for a solo developer.

### Non-Goals for MVP

- full dark-web monitoring
- credential stuffing
- private account discovery
- autonomous unrestricted crawling
- mobile application
- enterprise-grade multi-tenant billing
- real-time global internet scanning
- invasive geolocation tracking

---

## 6. Core User Journey

```text
Create Case
    ↓
Add Seed
(username / email / domain / IP / URL)
    ↓
Run Allowed Collectors
    ↓
Normalize Results
    ↓
Create Entities
    ↓
Create Relationships
    ↓
Attach Evidence
    ↓
Calculate Confidence
    ↓
Display Investigation Graph
    ↓
Analyst Reviews / Edits
    ↓
Generate Report
```

---

## 7. MVP Features

## 7.1 Authentication

- email/password or magic-link login
- session management
- user-owned investigations

## 7.2 Investigation Cases

Each case contains:

```text
Case ID
Title
Description
Status
Priority
Created At
Updated At
Owner
Tags
```

Statuses:

- Draft
- Active
- Archived
- Closed

## 7.3 Seed Input

Supported seed types:

- username
- email
- domain
- IP address
- URL
- organization
- public profile URL

The system should validate and normalize input before collection.

## 7.4 Entity Model

Initial entity types:

```text
PERSON
USERNAME
EMAIL
DOMAIN
URL
IP_ADDRESS
ORGANIZATION
REPOSITORY
SOCIAL_PROFILE
TECHNOLOGY
CERTIFICATE
DOCUMENT
```

An entity should contain:

```text
id
case_id
type
value
normalized_value
title
metadata
confidence
first_seen
last_seen
created_at
updated_at
```

## 7.5 Relationship Model

Initial relationship types:

```text
USES_USERNAME
OWNS_DOMAIN
RESOLVES_TO
LINKS_TO
MENTIONS
HOSTED_ON
USES_EMAIL
BELONGS_TO
RELATED_TO
SAME_AS
POSSIBLY_SAME_AS
OBSERVED_ON
```

Every relationship should include:

```text
source_entity_id
target_entity_id
relationship_type
confidence
evidence_count
reason
created_at
```

## 7.6 Evidence

Evidence is first-class data.

```text
Evidence
├── source_url
├── source_type
├── title
├── extracted_value
├── collected_at
├── collector
├── hash
├── notes
└── confidence
```

Example:

```text
Entity: example.com
Evidence: Certificate Transparency record
Source: public CT source
Collected: 2026-08-22T03:10:00Z
Confidence: High
```

## 7.7 Graph Visualization

Use React Flow for the graph interface.

Required interactions:

- pan
- zoom
- select node
- select edge
- drag node
- collapse/expand neighborhood
- fit graph to viewport
- hide selected node
- highlight path
- search graph
- filter by entity type
- filter by confidence

React Flow provides node dragging, zooming, panning, selection, and add/remove interactions out of the box. citeturn310587search8

## 7.8 Node Detail Panel

Selecting a node opens a side panel:

```text
ENTITY
example.com

Type
DOMAIN

Confidence
92%

First Seen
2026-08-01

Last Seen
2026-08-22

Relationships
12

Evidence
7
```

Tabs:

- Overview
- Relationships
- Evidence
- Timeline
- Raw Data

## 7.9 Evidence Drawer

Analysts can inspect:

- source URL
- collection date
- collector
- extracted fields
- raw response metadata
- notes

The product should clearly separate **observed evidence** from analyst interpretation.

## 7.10 Timeline

Timeline events:

```text
2026-08-01
Domain observed

2026-08-03
Subdomain observed

2026-08-06
Repository linked

2026-08-18
Certificate observed
```

## 7.11 Investigation Notes

Allow analysts to add notes to:

- case
- entity
- relationship
- evidence

Notes should support Markdown.

## 7.12 Search

Global investigation search across:

- entity value
- entity type
- evidence URL
- note text
- tags

## 7.13 Filters

Graph filters:

```text
Entity type
Relationship type
Confidence
Source
Date range
```

## 7.14 Export

MVP export:

- JSON
- CSV
- Markdown report

Phase 2:

- PDF
- STIX-compatible output

---

## 8. OSINT Collector Architecture

Collectors should be modular.

```text
Collector Interface
       ↓
┌───────────────┐
│ Username      │
│ Domain        │
│ DNS           │
│ URL           │
│ Certificate   │
│ Repository    │
└───────────────┘
```

Each collector returns a normalized result:

```ts
interface CollectorResult {
  source: string;
  collectedAt: string;
  entities: EntityCandidate[];
  relationships: RelationshipCandidate[];
  evidence: EvidenceCandidate[];
  warnings?: string[];
}
```

Collectors must not directly mutate graph state. They return candidates, which pass through a normalization and review pipeline.

---

## 9. Recommended Initial Collectors

Start with sources that are public, stable, and relatively easy to integrate.

### Phase 1

- DNS records
- URL metadata
- TLS certificate metadata
- public website metadata
- GitHub public repository metadata
- username presence checks against a small allowlisted provider set

### Phase 2

- certificate transparency
- public breach/credential exposure signals where lawful and licensed
- public paste/index sources
- technology fingerprinting

### Phase 3

- external threat intelligence APIs
- scheduled monitoring
- infrastructure change detection

Avoid building dozens of scrapers in the first release. That is how projects become graveyards full of broken selectors.

---

## 10. Correlation Engine

The correlation engine creates relationships based on explicit rules.

### Rule examples

```text
Same exact public email
→ SAME_AS candidate
→ High confidence
```

```text
Same username on two services
→ POSSIBLY_SAME_AS candidate
→ Medium confidence
```

```text
Domain resolves to IP
→ RESOLVES_TO
→ High confidence
```

```text
Public website links to repository
→ LINKS_TO
→ High confidence
```

Correlation must explain **why** a relationship was created.

Never show a confidence score without a reason.

---

## 11. Confidence Model

Initial scoring model:

```text
90–100   Very High
75–89    High
50–74    Medium
25–49    Low
0–24     Very Low
```

Example factors:

```text
Exact match              +40
Direct public reference  +30
Multiple independent sources +20
Temporal consistency     +10

Contradicting evidence   -30
Weak similarity          -10
```

This is a heuristic, not proof of identity.

The UI must use language such as:

> “Likely related”

rather than:

> “This is definitely the same person.”

---

## 12. Data Architecture

### MVP Recommendation

Use PostgreSQL/Supabase instead of Neo4j.

Reason:

- simpler deployment
- cheaper MVP
- familiar SQL
- authentication and storage can remain in one platform
- graph nodes and edges can be modeled as relational tables
- React Flow only needs a clean node/edge JSON payload

Example:

```text
cases
entities
relationships
evidence
observations
notes
timeline_events
collector_runs
```

### Phase 2 Graph Database

When graph traversal becomes the dominant workload, introduce Neo4j.

Neo4j has an official JavaScript/TypeScript driver and uses Cypher for graph querying. citeturn310587search0turn310587search1

Migration strategy:

```text
Supabase PostgreSQL
        ↓
Graph Export / Sync Layer
        ↓
Neo4j
```

---

## 13. API Design

Base URL:

```text
/api/v1
```

### Cases

```http
GET    /cases
POST   /cases
GET    /cases/:caseId
PATCH  /cases/:caseId
DELETE /cases/:caseId
```

### Seeds

```http
POST /cases/:caseId/seeds
GET  /cases/:caseId/seeds
```

### Collectors

```http
POST /cases/:caseId/collect
GET  /cases/:caseId/runs
GET  /cases/:caseId/runs/:runId
```

### Graph

```http
GET /cases/:caseId/graph
GET /cases/:caseId/graph/neighbors/:entityId
GET /cases/:caseId/graph/path?from=...&to=...
```

### Evidence

```http
GET  /entities/:entityId/evidence
POST /entities/:entityId/evidence
```

### Export

```http
POST /cases/:caseId/export
```

---

## 14. Frontend Information Architecture

```text
/login
/dashboard
/cases
/cases/:id
/cases/:id/graph
/cases/:id/timeline
/cases/:id/evidence
/settings
```

Primary case layout:

```text
┌─────────────────────────────────────────────────────┐
│ Topbar                                               │
├────────────┬──────────────────────────┬─────────────┤
│ Sidebar    │                          │ Detail      │
│            │        GRAPH             │ Panel       │
│ Entities   │                          │             │
│ Sources    │                          │ Entity      │
│ Filters    │                          │ Evidence    │
│            │                          │ Timeline    │
└────────────┴──────────────────────────┴─────────────┘
```

---

## 15. Security Requirements

### Authentication

- secure session handling
- row-level authorization
- case ownership checks

### Data

- encrypt sensitive secrets
- never store API keys in browser localStorage
- do not expose collector credentials to clients
- sanitize user-provided URLs and notes
- protect against SSRF in URL collectors
- rate-limit collectors
- enforce per-user job limits

### SSRF Protection

Any collector that fetches URLs must:

- block localhost
- block private IP ranges
- block cloud metadata endpoints
- validate redirects
- restrict protocols
- enforce timeout
- enforce response size limits

This is a critical requirement because OSINT tools frequently fetch attacker-controlled infrastructure.

---

## 16. Privacy Requirements

- collect only necessary data
- retain source and collection time
- provide case deletion
- provide evidence deletion
- avoid storing secrets unless explicitly required
- clearly label public-source data

---

## 17. Performance Targets

MVP targets:

```text
Initial dashboard:       < 2s
Graph render (100 nodes): < 1s target
Graph render (500 nodes): < 3s target
Search response:          < 500ms target
API p95:                  < 800ms target
```

Collector jobs are asynchronous and are not part of normal page latency.

---

## 18. Background Jobs

Collector jobs should use a queue/job model:

```text
API request
    ↓
create collector_run
    ↓
queue job
    ↓
worker executes
    ↓
normalize results
    ↓
insert candidates
    ↓
update graph
    ↓
notify frontend
```

For a small MVP, the job state can be stored in PostgreSQL and processed by a scheduled Worker or lightweight worker service.

Real-time updates can later use Cloudflare Durable Objects + WebSockets. Cloudflare documents Durable Objects as stateful coordination primitives and recommends their hibernating WebSocket API for long-lived connections when stateful coordination is needed. citeturn310587search2turn310587search13

Do not add WebSockets until the product actually needs live collector progress.

---

## 19. MVP Milestones

### Milestone 1 — Foundation

- React + Vite
- Tailwind
- authentication
- Supabase schema
- case CRUD

### Milestone 2 — Graph Core

- entities
- relationships
- evidence
- React Flow visualization
- node detail panel

### Milestone 3 — First Collectors

- DNS
- URL metadata
- TLS certificate metadata
- GitHub public metadata

### Milestone 4 — Correlation

- normalization
- duplicate detection
- confidence scoring
- relationship explanation

### Milestone 5 — Investigation UX

- timeline
- notes
- filters
- search
- export

### Milestone 6 — Hardening

- SSRF protection
- rate limiting
- job limits
- audit log
- tests

---

## 20. Future Roadmap

```text
MVP
 ↓
Graph Investigation
 ↓
More Collectors
 ↓
Scheduled Monitoring
 ↓
Threat Intelligence
 ↓
Case Collaboration
 ↓
Neo4j Option
 ↓
B2B API
 ↓
Enterprise Features
```

Potential B2B features:

- shared cases
- team permissions
- API access
- scheduled scans
- webhook alerts
- case templates
- evidence retention policies
- audit logs

---

## 21. Success Metrics

### Product

- investigations created
- entities per investigation
- relationships per investigation
- evidence items collected
- investigations completed
- report exports

### Technical

- collector success rate
- false correlation rate
- API p95
- graph rendering time
- job failure rate

### Quality

- percentage of relationships with evidence
- percentage of relationships with explainable confidence
- analyst correction rate

The most important quality metric is not the number of entities discovered. It is the percentage of useful, evidence-backed relationships.

---

## 22. Definition of Done for MVP

A user can:

1. create an investigation
2. enter a domain, username, email, IP, or URL
3. run at least three collectors
4. see discovered entities
5. see relationships between entities
6. inspect evidence for every important relationship
7. filter the graph
8. view a timeline
9. add notes
10. export the investigation
11. delete the investigation and its evidence

The MVP is successful when the user can complete a small real-world defensive OSINT case without leaving the application for basic graph organization and evidence management.
