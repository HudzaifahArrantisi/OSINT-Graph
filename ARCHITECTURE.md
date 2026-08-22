# ARCHITECTURE.md

# NexusGraph Technical Architecture

## 1. Recommended Stack

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- React Flow (`@xyflow/react`)
- React Router
- TanStack Query
- Zustand
- Lucide React

React Flow is a React library designed for node-based editors and interactive diagrams, with built-in node dragging, zooming, panning, selection, and related graph interactions. citeturn310587search8

### Backend

- TypeScript
- Hono
- Cloudflare Workers
- Zod

### Database

- Supabase PostgreSQL
- Supabase Auth

### Background Processing

Phase 1:

- Worker jobs
- PostgreSQL job table
- scheduled execution

Phase 2:

- dedicated worker service
- queue
- retry strategy

### Optional Graph Database

- Neo4j Aura

Neo4j provides an official JavaScript driver and Cypher graph query language. citeturn310587search0turn310587search1

---

## 2. Why TypeScript Everywhere?

Use TypeScript across frontend, API, shared data models, and collectors.

Benefits:

- one language
- shared types
- easier solo development
- easier API contracts
- good React ecosystem
- good Cloudflare ecosystem

Python should be introduced only for a collector or analysis task where Python's ecosystem creates a clear advantage.

Do not split the project into React + Node + Python + Go for the first version. That is not architecture. That is a cry for help.

---

## 3. Repository Structure

Recommended monorepo:

```text
nexusgraph/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── vite.config.ts
│   │
│   └── api/
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── collectors/
│       │   ├── normalization/
│       │   ├── correlation/
│       │   ├── jobs/
│       │   └── security/
│       └── wrangler.toml
│
├── packages/
│   ├── types/
│   ├── validation/
│   └── ui/
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── docs/
│   ├── PRD.md
│   ├── designSystem.md
│   └── ARCHITECTURE.md
│
├── package.json
└── pnpm-workspace.yaml
```

---

## 4. Core Database Schema

### cases

```sql
id uuid primary key
owner_id uuid not null
name text not null
description text
status text not null
tags jsonb
created_at timestamptz
updated_at timestamptz
```

### entities

```sql
id uuid primary key
case_id uuid not null
entity_type text not null
value text not null
normalized_value text not null
metadata jsonb
a_confidence numeric
created_at timestamptz
updated_at timestamptz
```

### relationships

```sql
id uuid primary key
case_id uuid not null
source_entity_id uuid not null
target_entity_id uuid not null
relationship_type text not null
confidence numeric
reason text
created_at timestamptz
```

### evidence

```sql
id uuid primary key
case_id uuid not null
entity_id uuid
relationship_id uuid
source_url text
source_type text
collector text
extracted_data jsonb
content_hash text
collected_at timestamptz
confidence numeric
created_at timestamptz
```

### collector_runs

```sql
id uuid primary key
case_id uuid not null
collector text not null
status text not null
input jsonb
result_summary jsonb
error text
started_at timestamptz
finished_at timestamptz
```

### notes

```sql
id uuid primary key
case_id uuid not null
entity_id uuid
relationship_id uuid
author_id uuid not null
content text not null
created_at timestamptz
updated_at timestamptz
```

### timeline_events

```sql
id uuid primary key
case_id uuid not null
entity_id uuid
relationship_id uuid
title text not null
description text
event_at timestamptz not null
source_evidence_id uuid
created_at timestamptz
```

---

## 5. Database Indexes

At minimum:

```sql
create index idx_entities_case on entities(case_id);
create index idx_entities_normalized on entities(normalized_value);
create index idx_relationships_case on relationships(case_id);
create index idx_relationships_source on relationships(source_entity_id);
create index idx_relationships_target on relationships(target_entity_id);
create index idx_evidence_case on evidence(case_id);
create index idx_evidence_entity on evidence(entity_id);
create index idx_timeline_case_time on timeline_events(case_id, event_at);
```

Use PostgreSQL full-text search or trigram search later for large cases.

---

## 6. Graph API Payload

Frontend should receive a simple React Flow-compatible structure.

```ts
interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

Example:

```json
{
  "nodes": [
    {
      "id": "entity-domain-1",
      "type": "domain",
      "data": {
        "label": "example.com",
        "confidence": 92
      },
      "position": {
        "x": 100,
        "y": 100
      }
    }
  ],
  "edges": []
}
```

Do not expose raw database records directly to the frontend.

---

## 7. Entity Normalization

Normalization is essential because the same artifact can appear in multiple forms.

### Domain

```text
HTTPS://Example.COM/
example.com
www.example.com
```

Store canonical normalized forms separately from display values.

### Email

Normalize domain casing and whitespace.

### URL

Normalize:

- protocol case
- trailing slash rules
- hostname casing
- default ports

Never mutate the original observed value. Preserve raw input for evidence.

---

## 8. Collector Interface

```ts
export interface CollectorContext {
  caseId: string;
  signal: AbortSignal;
  requestId: string;
}

export interface Collector {
  name: string;
  supports(inputType: string): boolean;
  run(input: unknown, ctx: CollectorContext): Promise<CollectorResult>;
}
```

Collector output:

```ts
export interface CollectorResult {
  entities: EntityCandidate[];
  relationships: RelationshipCandidate[];
  evidence: EvidenceCandidate[];
  warnings: string[];
}
```

Collectors should be deterministic where possible.

---

## 9. Correlation Pipeline

```text
Raw Collector Result
        ↓
Schema Validation
        ↓
Normalization
        ↓
Entity Deduplication
        ↓
Relationship Candidates
        ↓
Confidence Calculation
        ↓
Evidence Linking
        ↓
Persist
        ↓
Graph Refresh
```

Important rule:

> No relationship should exist without either direct evidence or an explicitly labeled analyst-created relationship.

---

## 10. Search Flow

```text
User seed
   ↓
Input validator
   ↓
Collector registry
   ↓
Selected collectors
   ↓
Parallel jobs
   ↓
Normalization
   ↓
Correlation
   ↓
Database
   ↓
Graph query
   ↓
React Flow
```

The UI should never call third-party OSINT APIs directly when secrets or rate-limit credentials are involved.

---

## 11. Query Strategy

### MVP neighborhood query

Use SQL joins for one- and two-hop queries.

Example conceptual query:

```text
entity
  ↓
relationships
  ↓
neighbor entities
```

### Deep traversal

When cases routinely require 3+ hop traversal over thousands of edges, evaluate Neo4j.

Do not adopt a graph database merely because the UI is a graph.

---

## 12. Neo4j Migration Trigger

Consider Neo4j when one or more conditions appear:

- large investigations exceed PostgreSQL query complexity
- shortest-path queries are frequent
- multi-hop graph traversal becomes a core feature
- graph algorithms become central
- analysts need advanced Cypher-driven investigation workflows

Neo4j's JavaScript driver is designed for JavaScript applications and its query model is based on Cypher. citeturn310587search1

---

## 13. Cloudflare Deployment

### Frontend

Deploy React/Vite static output through Cloudflare Pages or a suitable Cloudflare static-hosting flow.

### API

Deploy Hono API on Cloudflare Workers.

### Database

Supabase PostgreSQL.

### Secrets

Store API credentials in Cloudflare Worker secrets, not source code.

### Optional Real-Time

If live collector updates are needed:

```text
Browser
   ↕ WebSocket
Cloudflare Worker
   ↕
Durable Object
   ↓
Job state / notifications
```

Cloudflare documents Durable Objects as stateful coordination primitives and provides WebSocket support with hibernation for long-lived connections. citeturn310587search2turn310587search13

Use this only when necessary.

---

## 14. API Security

Every API endpoint should apply:

```text
Authentication
     ↓
Authorization
     ↓
Input validation
     ↓
Rate limit
     ↓
Business rule
     ↓
Database operation
```

Never trust `caseId`, `entityId`, or `ownerId` from the client.

---

## 15. SSRF Defense for URL Collectors

This is one of the most important parts of the project.

Before fetching a target URL:

1. parse URL
2. restrict protocol to HTTP/HTTPS
3. resolve hostname
4. reject private/reserved IPs
5. reject localhost
6. reject link-local ranges
7. reject metadata IP ranges
8. validate redirects repeatedly
9. enforce timeout
10. enforce max response size
11. restrict content types where practical
12. log request metadata

Do not rely on a simple string check such as:

```ts
if (url.includes('localhost')) reject();
```

SSRF defenses must validate the resolved network destination.

---

## 16. Rate Limits

Suggested MVP limits:

```text
Authenticated user
20 collector jobs / hour

Large collector
5 / hour

Case graph refresh
reasonable burst limit
```

These are starting values, not permanent product policy.

---

## 17. Testing Strategy

### Unit Tests

- normalization
- URL validation
- confidence scoring
- correlation rules
- collector parsing

### Integration Tests

- API + database
- collector pipeline
- evidence persistence
- graph payload generation

### Security Tests

- SSRF payloads
- authorization bypass
- malformed URLs
- oversized responses
- rate limit bypass attempts

### Frontend Tests

- graph rendering
- node selection
- filter behavior
- evidence panel
- mobile layout

---

## 18. Development Order

Build in this order:

```text
1. Repository setup
2. Supabase schema
3. Authentication
4. Case CRUD
5. Entity CRUD
6. Relationship CRUD
7. Evidence model
8. React Flow graph
9. Graph filtering
10. First collector: DNS
11. Second collector: URL metadata
12. Third collector: TLS certificate
13. Correlation engine
14. Timeline
15. Notes
16. Export
17. Security hardening
18. Deployment
```

Do not start with 20 OSINT collectors. Build the graph data model first.

---

## 19. First Collector: DNS

Input:

```text
example.com
```

Potential output:

```text
DOMAIN example.com
      │
      ├── A → IP
      ├── AAAA → IP
      ├── MX → mail.example.com
      └── NS → ns1.example.com
```

This gives an immediate, useful graph and proves the complete pipeline.

---

## 20. Second Collector: URL Metadata

Input:

```text
https://example.com
```

Collect only safe public metadata:

- status code
- final URL
- title
- content type
- server headers when appropriate
- redirects
- page metadata

Store the source URL and collection timestamp.

---

## 21. Third Collector: TLS Certificate

For HTTPS targets, collect public certificate metadata such as:

- subject
- issuer
- validity period
- SAN entries
- fingerprint

Create relationships such as:

```text
DOMAIN
   │
   └── PRESENTED_CERTIFICATE
                  │
                  └── CERTIFICATE
```

---

## 22. GitHub Collector

For public GitHub information, focus on:

- public repository
- repository URL
- public profile
- organization
- public commit metadata
- links explicitly published by the user

Do not attempt credential discovery, private repository access, or unauthorized enumeration.

---

## 23. Graph Layouts

Provide three layouts:

### Force Layout

Best default for investigations.

### Hierarchical

Best for infrastructure chains.

### Radial

Best when one seed is the center of the investigation.

The frontend can initially use a simple layout algorithm and persist manual analyst positions.

---

## 24. Recommended Packages

Example package set:

```bash
pnpm add @xyflow/react
pnpm add @tanstack/react-query
pnpm add zustand
pnpm add lucide-react
pnpm add zod
pnpm add hono
pnpm add @supabase/supabase-js
```

Optional later:

```bash
pnpm add neo4j-driver
```

Neo4j is deliberately optional during MVP.

---

## 25. Why This Architecture Is Lightweight

The MVP has only three major runtime pieces:

```text
React/Vite
     ↓
Cloudflare Worker API
     ↓
Supabase PostgreSQL
```

Collectors run behind the API and can be separated later.

No Kubernetes.

No microservice zoo.

No Kafka.

No Redis unless a real workload requires it.

No Neo4j until graph complexity justifies it.

This keeps the first version understandable to one developer.

---

## 26. Suggested Phase 2 Architecture

When usage grows:

```text
                 ┌───────────────┐
                 │ React Client  │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │ API Gateway   │
                 │ Cloudflare    │
                 └───────┬───────┘
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Cases      Collectors   Search
             │           │           │
             └───────────┼───────────┘
                         ▼
                   Correlation
                      Engine
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        PostgreSQL              Neo4j
              │                     │
              └──────────┬──────────┘
                         ▼
                  Investigation API
```

---

## 27. Final Technology Recommendation

### Use now

```text
React
Vite
TypeScript
Tailwind CSS
React Flow
Hono
Cloudflare Workers
Supabase PostgreSQL
Supabase Auth
Zod
TanStack Query
Zustand
Lucide React
```

### Add later

```text
Neo4j
Durable Objects
WebSockets
Queue system
Python workers
Threat-intelligence integrations
STIX/TAXII support
```

This keeps the project light while preserving a clean upgrade path.
