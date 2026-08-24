import type {
  EntityType,
  RelationshipType,
  InvestigationStatus,
  InvestigationPriority,
  SeedType,
  CollectorStatus,
  EvidenceSourceType,
  CollectorName,
  TransformStatus,
  DiscoveryJobStatus,
  TransformCategory,
} from '../constants/index.js';

// ─── Investigation / Case ───────────────────────────────────────────

export interface Investigation {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: InvestigationStatus;
  priority: InvestigationPriority;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateInvestigationInput {
  title: string;
  description?: string;
  priority?: InvestigationPriority;
  tags?: string[];
}

export interface UpdateInvestigationInput {
  title?: string;
  description?: string;
  status?: InvestigationStatus;
  priority?: InvestigationPriority;
  tags?: string[];
}

// ─── Entity ─────────────────────────────────────────────────────────

export interface Entity {
  id: string;
  case_id: string;
  type: EntityType;
  value: string;
  normalized_value: string;
  title: string | null;
  metadata: Record<string, unknown>;
  confidence: number;
  first_seen: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEntityInput {
  type: EntityType;
  value: string;
  title?: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export interface EntityCandidate {
  type: EntityType;
  value: string;
  title?: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
}

// ─── Relationship ───────────────────────────────────────────────────

export interface Relationship {
  id: string;
  case_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: RelationshipType;
  confidence: number;
  evidence_count: number;
  reason: string | null;
  created_at: string;
}

export interface CreateRelationshipInput {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: RelationshipType;
  confidence?: number;
  reason?: string;
}

export interface RelationshipCandidate {
  source_value: string;
  source_type: EntityType;
  target_value: string;
  target_type: EntityType;
  relationship_type: RelationshipType;
  confidence: number;
  reason: string;
}

// ─── Evidence ───────────────────────────────────────────────────────

export interface Evidence {
  id: string;
  case_id: string;
  entity_id: string | null;
  relationship_id: string | null;
  source_url: string | null;
  source_type: EvidenceSourceType;
  title: string | null;
  extracted_value: string | null;
  collector: string | null;
  collected_at: string;
  content_hash: string | null;
  notes: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateEvidenceInput {
  entity_id?: string;
  relationship_id?: string;
  source_url?: string;
  source_type: EvidenceSourceType;
  title?: string;
  extracted_value?: string;
  collector?: string;
  content_hash?: string;
  notes?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface EvidenceCandidate {
  source_url?: string;
  source_type: EvidenceSourceType;
  title?: string;
  extracted_value?: string;
  content_hash?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

// ─── Timeline ───────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  case_id: string;
  entity_id: string | null;
  relationship_id: string | null;
  title: string;
  description: string | null;
  event_at: string;
  source_evidence_id: string | null;
  created_at: string;
}

export interface CreateTimelineEventInput {
  entity_id?: string;
  relationship_id?: string;
  title: string;
  description?: string;
  event_at: string;
  source_evidence_id?: string;
}

// ─── Notes ──────────────────────────────────────────────────────────

export interface Note {
  id: string;
  case_id: string;
  entity_id: string | null;
  relationship_id: string | null;
  evidence_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteInput {
  entity_id?: string;
  relationship_id?: string;
  evidence_id?: string;
  content: string;
}

// ─── Collector ──────────────────────────────────────────────────────

export interface CollectorRun {
  id: string;
  case_id: string;
  collector: CollectorName;
  status: CollectorStatus;
  started_at: string;
  finished_at: string | null;
  request_id: string;
  input_type: SeedType;
  input_summary: string;
  result_count: number;
  warning_count: number;
  error_message: string | null;
}

export interface CollectorContext {
  caseId: string;
  signal: AbortSignal;
  requestId: string;
}

export interface CollectorResult {
  source: string;
  collectedAt: string;
  entities: EntityCandidate[];
  relationships: RelationshipCandidate[];
  evidence: EvidenceCandidate[];
  warnings: string[];
}

export interface Collector {
  name: CollectorName;
  supports(inputType: SeedType): boolean;
  run(input: string, ctx: CollectorContext): Promise<CollectorResult>;
}

// ─── Seed ───────────────────────────────────────────────────────────

export interface Seed {
  type: SeedType;
  value: string;
  normalized_value: string;
  raw_value: string;
}

export interface CreateSeedInput {
  type: SeedType;
  value: string;
}

// ─── Transform ──────────────────────────────────────────────────────

export interface TransformDefinition {
  id: string;
  name: string;
  description: string;
  inputTypes: EntityType[];
  outputTypes: EntityType[];
  category: TransformCategory;
  riskLevel: 'low' | 'medium';
  enabled: boolean;
}

export interface TransformResult {
  transformId: string;
  status: TransformStatus;
  entities: EntityCandidate[];
  relationships: RelationshipCandidate[];
  evidence: EvidenceCandidate[];
  warnings: string[];
  error?: string;
}

// ─── Discovery ──────────────────────────────────────────────────────

export interface DiscoveryJob {
  id: string;
  case_id: string;
  seed_entity_id: string | null;
  seed_value: string;
  seed_type: string;
  status: DiscoveryJobStatus;
  started_at: string | null;
  completed_at: string | null;
  total_transforms: number;
  completed_transforms: number;
  failed_transforms: number;
  found_entities: number;
  found_relationships: number;
  found_evidence: number;
  created_at: string;
}

export interface TransformRun {
  id: string;
  discovery_job_id: string;
  transform_id: string;
  transform_name: string;
  status: TransformStatus;
  started_at: string | null;
  completed_at: string | null;
  result_count: number;
  entities_found: number;
  relationships_found: number;
  error: string | null;
  created_at: string;
}

export interface DiscoveryPlan {
  seedType: SeedType;
  seedValue: string;
  transforms: TransformDefinition[];
}

export interface StartDiscoveryInput {
  seed_type: SeedType;
  seed_value: string;
}

export interface RunTransformInput {
  entity_id: string;
}

export type LogLevel =
  | 'info'
  | 'scan'
  | 'found'
  | 'warn'
  | 'error'
  | 'success'
  | 'debug'
  | 'http'
  | 'transform'
  | 'collector'
  | 'system';

export interface DiscoveryLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  tag?: string;
  message: string;
  transformId?: string;
  transformName?: string;
  entityCount?: number;
  relationshipCount?: number;
  data?: Record<string, unknown>;
  raw?: string;
}

export interface DiscoveryProgressEvent {
  type: 'log' | 'transform_start' | 'transform_complete' | 'transform_failed' | 'discovery_start' | 'discovery_complete' | 'discovery_progress';
  jobId: string;
  log: DiscoveryLogEntry;
  totalTransforms?: number;
  completedTransforms?: number;
  foundEntities?: number;
  foundRelationships?: number;
  foundEvidence?: number;
}

// ─── Graph (React Flow compatible) ──────────────────────────────────

export interface GraphNodeData {
  label: string;
  value?: string;
  title?: string | null;
  entityType: EntityType;
  confidence: number;
  entityId: string;
  metadata?: Record<string, unknown>;
  firstSeen?: string;
  lastSeen?: string;
  relationshipCount?: number;
  evidenceCount?: number;
  isSeed?: boolean;
  discoveryStatus?: 'seed' | 'discovered' | 'correlated' | 'unverified';
}

export interface GraphEdgeData {
  relationshipType: RelationshipType;
  confidence: number;
  reason?: string;
  evidenceCount?: number;
  relationshipId: string;
}

export interface GraphPayload {
  nodes: Array<{
    id: string;
    type: string;
    data: GraphNodeData;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data: GraphEdgeData;
  }>;
}

// ─── API Response Wrappers ──────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  requestId?: string;
}

// ─── User / Profile ─────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

// ─── Export ──────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'csv' | 'markdown';

export interface ExportRequest {
  format: ExportFormat;
}

// ─── Search ─────────────────────────────────────────────────────────

export interface SearchQuery {
  q: string;
  type?: EntityType;
  confidence_min?: number;
  confidence_max?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  entities: Entity[];
  evidence: Evidence[];
  notes: Note[];
  total: number;
}
