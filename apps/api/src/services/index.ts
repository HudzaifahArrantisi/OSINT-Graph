import { getSupabaseAdmin } from '../lib/supabase.js';
import { normalize } from '@nexusgraph/shared';
import type {
  Investigation,
  CreateInvestigationInput,
  UpdateInvestigationInput,
  Entity,
  CreateEntityInput,
  Relationship,
  CreateRelationshipInput,
  Evidence,
  CreateEvidenceInput,
  TimelineEvent,
  CreateTimelineEventInput,
  Note,
  CreateNoteInput,
  GraphPayload,
  SearchResult,
} from '@nexusgraph/shared';
const db = () => getSupabaseAdmin();

// ─── Ownership Validation ───────────────────────────────────────────

async function validateCaseOwnership(caseId: string, userId: string): Promise<boolean> {
  const { data } = await db()
    .from('investigations')
    .select('id')
    .eq('id', caseId)
    .eq('owner_id', userId)
    .single();

  return !!data;
}

// ─── Investigation Service ──────────────────────────────────────────

export const investigationService = {
  async list(userId: string): Promise<Investigation[]> {
    const { data, error } = await db()
      .from('investigations')
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to list investigations: ${error.message}`);
    return data || [];
  },

  async getById(id: string, userId: string): Promise<Investigation | null> {
    const { data, error } = await db()
      .from('investigations')
      .select('*')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async create(input: CreateInvestigationInput, userId: string): Promise<Investigation> {
    const { data, error } = await db()
      .from('investigations')
      .insert({
        owner_id: userId,
        title: input.title,
        description: input.description || null,
        status: 'DRAFT',
        priority: input.priority || 'MEDIUM',
        tags: input.tags || [],
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create investigation: ${error.message}`);
    return data;
  },

  async update(
    id: string,
    input: UpdateInvestigationInput,
    userId: string,
  ): Promise<Investigation> {
    if (!(await validateCaseOwnership(id, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('investigations')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update investigation: ${error.message}`);
    return data;
  },

  async delete(id: string, userId: string): Promise<void> {
    if (!(await validateCaseOwnership(id, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { error } = await db()
      .from('investigations')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId);

    if (error) throw new Error(`Failed to delete investigation: ${error.message}`);
  },

  async bulkDelete(ids: string[], userId: string): Promise<number> {
    if (!ids || ids.length === 0) return 0;

    const { error } = await db()
      .from('investigations')
      .delete()
      .in('id', ids)
      .eq('owner_id', userId);

    if (error) throw new Error(`Failed to bulk delete investigations: ${error.message}`);
    return ids.length;
  },

  async resetCase(id: string, userId: string): Promise<void> {
    if (!(await validateCaseOwnership(id, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    // Delete discovery jobs and associated transform runs
    const { data: jobs } = await db()
      .from('discovery_jobs')
      .select('id')
      .eq('case_id', id);

    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);
      await db().from('transform_runs').delete().in('discovery_job_id', jobIds);
      await db().from('discovery_jobs').delete().eq('case_id', id);
    }

    // Delete all child data for this case
    await db().from('relationships').delete().eq('case_id', id);
    await db().from('evidence').delete().eq('case_id', id);
    await db().from('timeline_events').delete().eq('case_id', id);
    await db().from('collector_runs').delete().eq('case_id', id);
    await db().from('notes').delete().eq('case_id', id);
    await db().from('entities').delete().eq('case_id', id);
  },
};

// ─── Entity Service ─────────────────────────────────────────────────

export const entityService = {
  async list(caseId: string, userId: string): Promise<Entity[]> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('entities')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async getById(id: string, caseId: string, userId: string): Promise<Entity | null> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('entities')
      .select('*')
      .eq('id', id)
      .eq('case_id', caseId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async upsert(input: CreateEntityInput, caseId: string, userId: string): Promise<Entity> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const normalizedValue = normalize(input.type, input.value);
    const now = new Date().toISOString();

    // Check for existing entity with same normalized value in this case
    const { data: existing } = await db()
      .from('entities')
      .select('*')
      .eq('case_id', caseId)
      .eq('type', input.type)
      .eq('normalized_value', normalizedValue)
      .single();

    if (existing) {
      // Update existing entity — merge metadata, update last_seen
      const mergedMeta = { ...existing.metadata, ...input.metadata };
      const newConfidence = Math.max(existing.confidence, input.confidence || 50);

      const { data, error } = await db()
        .from('entities')
        .update({
          metadata: mergedMeta,
          confidence: newConfidence,
          last_seen: now,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update entity: ${error.message}`);
      return data;
    }

    // Insert new entity
    const { data, error } = await db()
      .from('entities')
      .insert({
        case_id: caseId,
        type: input.type,
        value: input.value,
        normalized_value: normalizedValue,
        title: input.title || null,
        metadata: input.metadata || {},
        confidence: input.confidence || 50,
        first_seen: now,
        last_seen: now,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create entity: ${error.message}`);
    return data;
  },

  async delete(id: string, caseId: string, userId: string): Promise<void> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    // Delete relationships connected to this entity
    await db()
      .from('relationships')
      .delete()
      .eq('case_id', caseId)
      .or(`source_entity_id.eq.${id},target_entity_id.eq.${id}`);

    // Delete evidence referencing this entity
    await db().from('evidence').delete().eq('case_id', caseId).eq('entity_id', id);

    // Delete entity
    const { error } = await db()
      .from('entities')
      .delete()
      .eq('id', id)
      .eq('case_id', caseId);

    if (error) throw new Error(`Failed to delete entity: ${error.message}`);
  },

  async deleteByType(caseId: string, type: string, userId: string): Promise<number> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    // Get all entities of this type
    const { data: entitiesToDelete } = await db()
      .from('entities')
      .select('id')
      .eq('case_id', caseId)
      .eq('type', type);

    if (!entitiesToDelete || entitiesToDelete.length === 0) return 0;

    const ids = entitiesToDelete.map((e) => e.id);

    // Delete relationships referencing these entities
    await db()
      .from('relationships')
      .delete()
      .eq('case_id', caseId)
      .in('source_entity_id', ids);

    await db()
      .from('relationships')
      .delete()
      .eq('case_id', caseId)
      .in('target_entity_id', ids);

    // Delete entities
    const { error } = await db()
      .from('entities')
      .delete()
      .eq('case_id', caseId)
      .eq('type', type);

    if (error) throw new Error(`Failed to delete entities of type ${type}: ${error.message}`);
    return ids.length;
  },

  async findByNormalizedValue(
    normalizedValue: string,
    caseId: string,
    userId: string,
  ): Promise<Entity | null> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('entities')
      .select('*')
      .eq('case_id', caseId)
      .eq('normalized_value', normalizedValue)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async deleteSeed(
    caseId: string,
    seedEntityId: string,
    userId: string,
  ): Promise<{
    deletedEntitiesCount: number;
    deletedRelationshipsCount: number;
    deletedJobsCount: number;
    seedValue: string;
  }> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    // 1. Get the target seed entity
    const targetEntity = await this.getById(seedEntityId, caseId, userId);
    if (!targetEntity) {
      throw new Error('Seed entity not found');
    }

    // 2. Fetch all entities and relationships in the case
    const [allEntities, allRelationships] = await Promise.all([
      this.list(caseId, userId),
      relationshipService.list(caseId, userId),
    ]);

    // 3. Find other seeds in the investigation
    const otherSeeds = allEntities.filter(
      (e) => e.id !== seedEntityId && (e.type === 'SEED' || (e.metadata as any)?.isSeed === true),
    );

    // 4. Build adjacency graph
    const adj = new Map<string, Set<string>>();
    for (const e of allEntities) {
      adj.set(e.id, new Set());
    }
    for (const r of allRelationships) {
      adj.get(r.source_entity_id)?.add(r.target_entity_id);
      adj.get(r.target_entity_id)?.add(r.source_entity_id);
    }

    // 5. BFS from target seed to find all reachable nodes
    const reachableFromTarget = new Set<string>();
    const queue = [seedEntityId];
    reachableFromTarget.add(seedEntityId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!reachableFromTarget.has(neighbor)) {
          reachableFromTarget.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Also include entities whose metadata explicitly traces back to this seed
    for (const e of allEntities) {
      const meta = (e.metadata || {}) as Record<string, any>;
      if (
        meta.derivedFromSeed === targetEntity.value ||
        meta.seedValue === targetEntity.value ||
        meta.source?.derivedFrom === targetEntity.value
      ) {
        reachableFromTarget.add(e.id);
      }
    }

    // 6. BFS from other seeds (if any) to protect nodes shared with / reachable from other seeds
    const reachableFromOtherSeeds = new Set<string>();
    if (otherSeeds.length > 0) {
      const otherQueue = otherSeeds.map((s) => s.id);
      for (const s of otherSeeds) reachableFromOtherSeeds.add(s.id);
      while (otherQueue.length > 0) {
        const current = otherQueue.shift()!;
        const neighbors = adj.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!reachableFromOtherSeeds.has(neighbor)) {
            reachableFromOtherSeeds.add(neighbor);
            otherQueue.push(neighbor);
          }
        }
      }
    }

    // 7. Entities to delete = reachableFromTarget EXCEPT reachableFromOtherSeeds (always including seedEntityId)
    const entitiesToDelete = new Set<string>();
    entitiesToDelete.add(seedEntityId);
    for (const id of reachableFromTarget) {
      if (!reachableFromOtherSeeds.has(id)) {
        entitiesToDelete.add(id);
      }
    }

    const idsToDelete = Array.from(entitiesToDelete);

    // 8. Delete discovery jobs & transform runs matching this seed
    let deletedJobsCount = 0;
    const { data: jobs } = await db()
      .from('discovery_jobs')
      .select('id')
      .eq('case_id', caseId)
      .or(`seed_entity_id.eq.${seedEntityId},seed_value.eq.${targetEntity.value}`);

    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);
      deletedJobsCount = jobIds.length;
      await db().from('transform_runs').delete().in('discovery_job_id', jobIds);
      await db().from('discovery_jobs').delete().in('id', jobIds);
    }

    // 9. Delete collector runs for this seed
    await db()
      .from('collector_runs')
      .delete()
      .eq('case_id', caseId)
      .eq('input_summary', targetEntity.value);

    // 10. Delete connected relationships, evidence, timeline, notes, entities
    let deletedRelationshipsCount = 0;
    if (idsToDelete.length > 0) {
      const relsToDelete = allRelationships.filter(
        (r) => entitiesToDelete.has(r.source_entity_id) || entitiesToDelete.has(r.target_entity_id),
      );
      deletedRelationshipsCount = relsToDelete.length;

      await db()
        .from('relationships')
        .delete()
        .eq('case_id', caseId)
        .in('source_entity_id', idsToDelete);

      await db()
        .from('relationships')
        .delete()
        .eq('case_id', caseId)
        .in('target_entity_id', idsToDelete);

      await db().from('evidence').delete().eq('case_id', caseId).in('entity_id', idsToDelete);
      await db().from('timeline_events').delete().eq('case_id', caseId).in('entity_id', idsToDelete);
      await db().from('notes').delete().eq('case_id', caseId).in('entity_id', idsToDelete);

      const { error: delError } = await db()
        .from('entities')
        .delete()
        .eq('case_id', caseId)
        .in('id', idsToDelete);

      if (delError) {
        throw new Error(`Failed to delete entities: ${delError.message}`);
      }
    }

    return {
      deletedEntitiesCount: idsToDelete.length,
      deletedRelationshipsCount,
      deletedJobsCount,
      seedValue: targetEntity.value,
    };
  },
};

// ─── Relationship Service ───────────────────────────────────────────

export const relationshipService = {
  async list(caseId: string, userId: string): Promise<Relationship[]> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('relationships')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(
    input: CreateRelationshipInput,
    caseId: string,
    userId: string,
  ): Promise<Relationship> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    // Check for existing relationship between same entities
    const { data: existing } = await db()
      .from('relationships')
      .select('*')
      .eq('case_id', caseId)
      .eq('source_entity_id', input.source_entity_id)
      .eq('target_entity_id', input.target_entity_id)
      .eq('relationship_type', input.relationship_type)
      .single();

    if (existing) {
      // Update confidence and evidence count
      const { data, error } = await db()
        .from('relationships')
        .update({
          confidence: Math.max(existing.confidence, input.confidence || 50),
          evidence_count: existing.evidence_count + 1,
          reason: input.reason || existing.reason,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await db()
      .from('relationships')
      .insert({
        case_id: caseId,
        source_entity_id: input.source_entity_id,
        target_entity_id: input.target_entity_id,
        relationship_type: input.relationship_type,
        confidence: input.confidence || 50,
        evidence_count: 1,
        reason: input.reason || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create relationship: ${error.message}`);
    return data;
  },
};

// ─── Evidence Service ───────────────────────────────────────────────

export const evidenceService = {
  async list(caseId: string, userId: string): Promise<Evidence[]> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('evidence')
      .select('*')
      .eq('case_id', caseId)
      .order('collected_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async listByEntity(
    entityId: string,
    caseId: string,
    userId: string,
  ): Promise<Evidence[]> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('evidence')
      .select('*')
      .eq('case_id', caseId)
      .eq('entity_id', entityId)
      .order('collected_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(input: CreateEvidenceInput, caseId: string, userId: string): Promise<Evidence> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('evidence')
      .insert({
        case_id: caseId,
        entity_id: input.entity_id || null,
        relationship_id: input.relationship_id || null,
        source_url: input.source_url || null,
        source_type: input.source_type,
        title: input.title || null,
        extracted_value: input.extracted_value || null,
        collector: input.collector || null,
        collected_at: new Date().toISOString(),
        content_hash: input.content_hash || null,
        notes: input.notes || null,
        confidence: input.confidence || 50,
        metadata: input.metadata || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create evidence: ${error.message}`);
    return data;
  },
};

// ─── Timeline Service ───────────────────────────────────────────────

export const timelineService = {
  async list(caseId: string, userId: string): Promise<TimelineEvent[]> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('timeline_events')
      .select('*')
      .eq('case_id', caseId)
      .order('event_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(
    input: CreateTimelineEventInput,
    caseId: string,
    userId: string,
  ): Promise<TimelineEvent> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('timeline_events')
      .insert({
        case_id: caseId,
        entity_id: input.entity_id || null,
        relationship_id: input.relationship_id || null,
        title: input.title,
        description: input.description || null,
        event_at: input.event_at,
        source_evidence_id: input.source_evidence_id || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create timeline event: ${error.message}`);
    return data;
  },
};

// ─── Notes Service ──────────────────────────────────────────────────

export const noteService = {
  async list(caseId: string, userId: string): Promise<Note[]> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('notes')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(input: CreateNoteInput, caseId: string, userId: string): Promise<Note> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('notes')
      .insert({
        case_id: caseId,
        entity_id: input.entity_id || null,
        relationship_id: input.relationship_id || null,
        evidence_id: input.evidence_id || null,
        author_id: userId,
        content: input.content,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create note: ${error.message}`);
    return data;
  },

  async update(id: string, content: string, caseId: string, userId: string): Promise<Note> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('notes')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('case_id', caseId)
      .eq('author_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update note: ${error.message}`);
    return data;
  },

  async delete(id: string, caseId: string, userId: string): Promise<void> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { error } = await db()
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('case_id', caseId)
      .eq('author_id', userId);

    if (error) throw new Error(`Failed to delete note: ${error.message}`);
  },
};

// ─── Graph Service ──────────────────────────────────────────────────

export const graphService = {
  async getGraphPayload(caseId: string, userId: string): Promise<GraphPayload> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const [entities, relationships, evidenceList] = await Promise.all([
      entityService.list(caseId, userId),
      relationshipService.list(caseId, userId),
      evidenceService.list(caseId, userId),
    ]);

    // Count evidence per entity and per relationship
    const entityEvidenceCount = new Map<string, number>();
    const entityRelCount = new Map<string, number>();

    for (const ev of evidenceList) {
      if (ev.entity_id) {
        entityEvidenceCount.set(ev.entity_id, (entityEvidenceCount.get(ev.entity_id) || 0) + 1);
      }
    }

    for (const rel of relationships) {
      entityRelCount.set(
        rel.source_entity_id,
        (entityRelCount.get(rel.source_entity_id) || 0) + 1,
      );
      entityRelCount.set(
        rel.target_entity_id,
        (entityRelCount.get(rel.target_entity_id) || 0) + 1,
      );
    }

    // Layout: simple grid-based initial positions, frontend will reposition
    const cols = Math.max(4, Math.ceil(Math.sqrt(entities.length)));
    const spacing = 250;

    const nodes = entities.map((entity, idx) => {
      const isSeed = entity.type === 'SEED' || !!(entity.metadata as any)?.isSeed;
      const evCount = entityEvidenceCount.get(entity.id) || 0;
      let discoveryStatus: 'seed' | 'discovered' | 'correlated' | 'unverified' = 'discovered';
      if (isSeed) discoveryStatus = 'seed';
      else if (evCount === 0) discoveryStatus = 'unverified';
      else if (entity.confidence < 50) discoveryStatus = 'unverified';

      return {
        id: entity.id,
        type: entity.type.toLowerCase(),
        data: {
          label: entity.value || entity.title,
          value: entity.value,
          title: entity.title,
          entityType: entity.type,
          confidence: entity.confidence,
          entityId: entity.id,
          metadata: entity.metadata,
          firstSeen: entity.first_seen,
          lastSeen: entity.last_seen,
          relationshipCount: entityRelCount.get(entity.id) || 0,
          evidenceCount: evCount,
          isSeed,
          discoveryStatus,
        },
        position: {
          x: (idx % cols) * spacing,
          y: Math.floor(idx / cols) * spacing,
        },
      };
    });

    const edges = relationships.map((rel) => ({
      id: rel.id,
      source: rel.source_entity_id,
      target: rel.target_entity_id,
      data: {
        relationshipType: rel.relationship_type,
        confidence: rel.confidence,
        reason: rel.reason,
        evidenceCount: rel.evidence_count,
        relationshipId: rel.id,
      },
    }));

    return { nodes, edges } as GraphPayload;
  },
};

// ─── Search Service ─────────────────────────────────────────────────

export const searchService = {
  async search(
    caseId: string,
    query: string,
    userId: string,
    options?: { type?: string; limit?: number; offset?: number },
  ): Promise<SearchResult> {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    // Sanitize query to prevent PostgREST syntax parsing errors
    const sanitized = query.replace(/[,()]/g, ' ').trim();
    const searchPattern = `%${sanitized}%`;

    // Search entities
    let entityQuery = db()
      .from('entities')
      .select('*', { count: 'exact' })
      .eq('case_id', caseId)
      .or(`value.ilike.${searchPattern},normalized_value.ilike.${searchPattern},title.ilike.${searchPattern}`)
      .range(offset, offset + limit - 1);

    if (options?.type) {
      entityQuery = entityQuery.eq('type', options.type);
    }

    const { data: entities, count: entityCount } = await entityQuery;

    // Search evidence
    const { data: evidence } = await db()
      .from('evidence')
      .select('*')
      .eq('case_id', caseId)
      .or(`source_url.ilike.${searchPattern},title.ilike.${searchPattern},extracted_value.ilike.${searchPattern}`)
      .range(0, limit - 1);

    // Search notes
    const { data: notes } = await db()
      .from('notes')
      .select('*')
      .eq('case_id', caseId)
      .ilike('content', searchPattern)
      .range(0, limit - 1);

    return {
      entities: entities || [],
      evidence: evidence || [],
      notes: notes || [],
      total: (entityCount || 0) + (evidence?.length || 0) + (notes?.length || 0),
    };
  },
};

// ─── Collector Run Service ──────────────────────────────────────────

export const collectorRunService = {
  async list(caseId: string, userId: string) {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('collector_runs')
      .select('*')
      .eq('case_id', caseId)
      .order('started_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(run: {
    case_id: string;
    collector: string;
    status: string;
    request_id: string;
    input_type: string;
    input_summary: string;
  }) {
    const { data, error } = await db()
      .from('collector_runs')
      .insert({
        ...run,
        started_at: new Date().toISOString(),
        result_count: 0,
        warning_count: 0,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, updates: Record<string, unknown>) {
    const { data, error } = await db()
      .from('collector_runs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
};

// ─── Export Service ─────────────────────────────────────────────────

export const exportService = {
  async exportJson(caseId: string, userId: string) {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const [investigation, entities, relationships, evidenceList, timeline, notes] =
      await Promise.all([
        investigationService.getById(caseId, userId),
        entityService.list(caseId, userId),
        relationshipService.list(caseId, userId),
        evidenceService.list(caseId, userId),
        timelineService.list(caseId, userId),
        noteService.list(caseId, userId),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      investigation,
      entities,
      relationships,
      evidence: evidenceList,
      timeline,
      notes,
    };
  },

  async exportCsv(caseId: string, userId: string): Promise<string> {
    const data = await this.exportJson(caseId, userId);
    const lines: string[] = [];

    // Entities CSV
    lines.push('# Entities');
    lines.push('id,type,value,normalized_value,confidence,first_seen,last_seen');
    for (const e of data.entities) {
      lines.push(
        `"${e.id}","${e.type}","${e.value}","${e.normalized_value}",${e.confidence},"${e.first_seen || ''}","${e.last_seen || ''}"`,
      );
    }

    lines.push('');
    lines.push('# Relationships');
    lines.push('id,source_entity_id,target_entity_id,type,confidence,reason');
    for (const r of data.relationships) {
      lines.push(
        `"${r.id}","${r.source_entity_id}","${r.target_entity_id}","${r.relationship_type}",${r.confidence},"${r.reason || ''}"`,
      );
    }

    lines.push('');
    lines.push('# Evidence');
    lines.push('id,source_url,source_type,collector,confidence,collected_at');
    for (const ev of data.evidence) {
      lines.push(
        `"${ev.id}","${ev.source_url || ''}","${ev.source_type}","${ev.collector || ''}",${ev.confidence},"${ev.collected_at}"`,
      );
    }

    return lines.join('\n');
  },

  async exportMarkdown(caseId: string, userId: string): Promise<string> {
    const data = await this.exportJson(caseId, userId);
    const inv = data.investigation;
    if (!inv) return '# Investigation Not Found';

    const lines: string[] = [];

    lines.push(`# Investigation Report: ${inv.title}`);
    lines.push('');
    lines.push('## Case Summary');
    lines.push('');
    lines.push(`- **Status:** ${inv.status}`);
    lines.push(`- **Priority:** ${inv.priority}`);
    lines.push(`- **Created:** ${inv.created_at}`);
    lines.push(`- **Last Updated:** ${inv.updated_at}`);
    if (inv.tags.length > 0) {
      lines.push(`- **Tags:** ${inv.tags.join(', ')}`);
    }
    if (inv.description) {
      lines.push('');
      lines.push(inv.description);
    }

    lines.push('');
    lines.push('## Key Entities');
    lines.push('');
    lines.push('| Type | Value | Confidence | First Seen | Last Seen |');
    lines.push('|------|-------|-----------|------------|-----------|');
    for (const e of data.entities) {
      lines.push(
        `| ${e.type} | ${e.value} | ${e.confidence}% | ${e.first_seen || '-'} | ${e.last_seen || '-'} |`,
      );
    }

    lines.push('');
    lines.push('## Relationships');
    lines.push('');
    lines.push('| Source | Type | Target | Confidence | Reason |');
    lines.push('|--------|------|--------|-----------|--------|');
    for (const r of data.relationships) {
      const srcEntity = data.entities.find((e) => e.id === r.source_entity_id);
      const tgtEntity = data.entities.find((e) => e.id === r.target_entity_id);
      lines.push(
        `| ${srcEntity?.value || r.source_entity_id} | ${r.relationship_type} | ${tgtEntity?.value || r.target_entity_id} | ${r.confidence}% | ${r.reason || '-'} |`,
      );
    }

    lines.push('');
    lines.push('## Evidence');
    lines.push('');
    for (const ev of data.evidence) {
      lines.push(`### ${ev.title || 'Evidence'}`);
      lines.push('');
      lines.push(`- **Source:** ${ev.source_url || 'N/A'}`);
      lines.push(`- **Type:** ${ev.source_type}`);
      lines.push(`- **Collector:** ${ev.collector || 'manual'}`);
      lines.push(`- **Confidence:** ${ev.confidence}%`);
      lines.push(`- **Collected:** ${ev.collected_at}`);
      if (ev.extracted_value) {
        lines.push(`- **Extracted:** ${ev.extracted_value}`);
      }
      lines.push('');
    }

    lines.push('## Timeline');
    lines.push('');
    for (const t of data.timeline) {
      lines.push(`- **${t.event_at}** — ${t.title}`);
      if (t.description) lines.push(`  ${t.description}`);
    }

    lines.push('');
    lines.push('## Analyst Notes');
    lines.push('');
    for (const n of data.notes) {
      lines.push(`> ${n.content.replace(/\n/g, '\n> ')}`);
      lines.push(`> — *${n.created_at}*`);
      lines.push('');
    }

    lines.push('');
    lines.push('## Confidence & Limitations');
    lines.push('');
    lines.push(
      '> This report is generated from public data and analyst observations. ' +
        'Relationships are based on observed evidence and heuristic scoring. ' +
        'Inferred relationships should not be treated as proven facts.',
    );
    lines.push('');
    lines.push(`*Report generated at ${new Date().toISOString()}*`);

    return lines.join('\n');
  },
};

// ─── Discovery Job Service ──────────────────────────────────────────

export const discoveryJobService = {
  async list(caseId: string, userId: string) {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('discovery_jobs')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async getById(id: string, caseId: string, userId: string) {
    if (!(await validateCaseOwnership(caseId, userId))) {
      throw new Error('Investigation not found or access denied');
    }

    const { data, error } = await db()
      .from('discovery_jobs')
      .select('*')
      .eq('id', id)
      .eq('case_id', caseId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async create(input: {
    case_id: string;
    seed_entity_id: string;
    seed_value: string;
    seed_type: string;
    total_transforms: number;
  }) {
    const { data, error } = await db()
      .from('discovery_jobs')
      .insert({
        ...input,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create discovery job: ${error.message}`);
    return data;
  },

  async update(id: string, updates: Record<string, unknown>) {
    const { data, error } = await db()
      .from('discovery_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update discovery job: ${error.message}`);
    return data;
  },
};

// ─── Transform Run Service ──────────────────────────────────────────

export const transformRunService = {
  async listByJob(jobId: string) {
    const { data, error } = await db()
      .from('transform_runs')
      .select('*')
      .eq('discovery_job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(input: {
    discovery_job_id: string;
    transform_id: string;
    transform_name: string;
  }) {
    const { data, error } = await db()
      .from('transform_runs')
      .insert({
        ...input,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create transform run: ${error.message}`);
    return data;
  },

  async update(id: string, updates: Record<string, unknown>) {
    const { data, error } = await db()
      .from('transform_runs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update transform run: ${error.message}`);
    return data;
  },
};
