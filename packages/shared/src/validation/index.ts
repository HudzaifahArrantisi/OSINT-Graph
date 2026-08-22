import { z } from 'zod';
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  INVESTIGATION_STATUSES,
  INVESTIGATION_PRIORITIES,
  SEED_TYPES,
  COLLECTOR_STATUSES,
  EVIDENCE_SOURCE_TYPES,
  COLLECTOR_NAMES,
} from '../constants/index.js';

// ─── Shared primitives ──────────────────────────────────────────────

const uuidSchema = z.string().uuid();
const confidenceSchema = z.number().min(0).max(100).default(50);

// ─── Investigation ──────────────────────────────────────────────────

export const createInvestigationSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  priority: z.enum(INVESTIGATION_PRIORITIES).default('MEDIUM'),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const updateInvestigationSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(INVESTIGATION_STATUSES).optional(),
  priority: z.enum(INVESTIGATION_PRIORITIES).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// ─── Entity ─────────────────────────────────────────────────────────

export const createEntitySchema = z.object({
  type: z.enum(ENTITY_TYPES),
  value: z.string().min(1).max(2000).trim(),
  title: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).default({}),
  confidence: confidenceSchema,
});

// ─── Relationship ───────────────────────────────────────────────────

export const createRelationshipSchema = z.object({
  source_entity_id: uuidSchema,
  target_entity_id: uuidSchema,
  relationship_type: z.enum(RELATIONSHIP_TYPES),
  confidence: confidenceSchema,
  reason: z.string().max(1000).optional(),
});

// ─── Evidence ───────────────────────────────────────────────────────

export const createEvidenceSchema = z.object({
  entity_id: uuidSchema.optional(),
  relationship_id: uuidSchema.optional(),
  source_url: z.string().url().max(4000).optional(),
  source_type: z.enum(EVIDENCE_SOURCE_TYPES),
  title: z.string().max(500).optional(),
  extracted_value: z.string().max(10000).optional(),
  collector: z.string().max(100).optional(),
  content_hash: z.string().max(128).optional(),
  notes: z.string().max(5000).optional(),
  confidence: confidenceSchema,
  metadata: z.record(z.unknown()).default({}),
});

// ─── Timeline ───────────────────────────────────────────────────────

export const createTimelineEventSchema = z.object({
  entity_id: uuidSchema.optional(),
  relationship_id: uuidSchema.optional(),
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(2000).optional(),
  event_at: z.string().datetime(),
  source_evidence_id: uuidSchema.optional(),
});

// ─── Notes ──────────────────────────────────────────────────────────

export const createNoteSchema = z.object({
  entity_id: uuidSchema.optional(),
  relationship_id: uuidSchema.optional(),
  evidence_id: uuidSchema.optional(),
  content: z.string().min(1).max(10000).trim(),
});

export const updateNoteSchema = z.object({
  content: z.string().min(1).max(10000).trim(),
});

// ─── Seed ───────────────────────────────────────────────────────────

export const createSeedSchema = z.object({
  type: z.enum(SEED_TYPES),
  value: z.string().min(1).max(2000).trim(),
});

// ─── Collector ──────────────────────────────────────────────────────

export const runCollectorSchema = z.object({
  seed_type: z.enum(SEED_TYPES),
  seed_value: z.string().min(1).max(2000).trim(),
  collectors: z.array(z.enum(COLLECTOR_NAMES)).min(1).max(10),
});

// ─── Discovery ──────────────────────────────────────────────────────

export const startDiscoverySchema = z.object({
  seed_type: z.enum(SEED_TYPES),
  seed_value: z.string().min(1).max(2000).trim(),
});

export const runTransformSchema = z.object({
  entity_id: uuidSchema,
});

// ─── Search ─────────────────────────────────────────────────────────

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500).trim(),
  type: z.enum(ENTITY_TYPES).optional(),
  confidence_min: z.coerce.number().min(0).max(100).optional(),
  confidence_max: z.coerce.number().min(0).max(100).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ─── Export ─────────────────────────────────────────────────────────

export const exportRequestSchema = z.object({
  format: z.enum(['json', 'csv', 'markdown']),
});

// ─── Params ─────────────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const caseIdParamSchema = z.object({
  caseId: uuidSchema,
});

// ─── Graph filter ───────────────────────────────────────────────────

export const graphFilterSchema = z.object({
  entity_types: z.array(z.enum(ENTITY_TYPES)).optional(),
  relationship_types: z.array(z.enum(RELATIONSHIP_TYPES)).optional(),
  confidence_min: z.coerce.number().min(0).max(100).optional(),
  confidence_max: z.coerce.number().min(0).max(100).optional(),
  collector: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

// Re-export collector/status enums as Zod schemas for reuse
export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const relationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);
export const investigationStatusSchema = z.enum(INVESTIGATION_STATUSES);
export const collectorStatusSchema = z.enum(COLLECTOR_STATUSES);
export const seedTypeSchema = z.enum(SEED_TYPES);
export const evidenceSourceTypeSchema = z.enum(EVIDENCE_SOURCE_TYPES);
