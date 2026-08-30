/**
 * Path Finder — BFS shortest-path between two entities within a single case.
 *
 * This operates on the relational entity/relationship data stored in Supabase,
 * building an in-memory adjacency list and running breadth-first search.
 * Cross-case traversal is intentionally not supported.
 */

import type { PathResult, PathHop } from '@nexusgraph/shared';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const db = () => getSupabaseAdmin();

interface AdjEntry {
  neighborId: string;
  relationshipId: string;
  relationshipType: string;
  confidence: number;
}

/**
 * Find the shortest path between two entities using BFS.
 * Returns PathResult with ordered hops and cumulative confidence.
 */
export async function findShortestPath(
  caseId: string,
  fromEntityId: string,
  toEntityId: string,
  userId: string,
): Promise<PathResult> {
  // Validate ownership (inline — same pattern as services)
  const { data: ownerCheck } = await db()
    .from('investigations')
    .select('id')
    .eq('id', caseId)
    .eq('owner_id', userId)
    .single();

  if (!ownerCheck) {
    throw new Error('Investigation not found or access denied');
  }

  // Fetch entities and relationships for this case
  const [entitiesRes, relsRes] = await Promise.all([
    db()
      .from('entities')
      .select('id, type, value, normalized_value, confidence')
      .eq('case_id', caseId),
    db()
      .from('relationships')
      .select('id, source_entity_id, target_entity_id, relationship_type, confidence')
      .eq('case_id', caseId),
  ]);

  if (entitiesRes.error) throw new Error(`Failed to fetch entities: ${entitiesRes.error.message}`);
  if (relsRes.error) throw new Error(`Failed to fetch relationships: ${relsRes.error.message}`);

  const entities = entitiesRes.data || [];
  const relationships = relsRes.data || [];

  // Build entity lookup
  const entityMap = new Map<string, { id: string; type: string; value: string; confidence: number }>();
  for (const e of entities) {
    entityMap.set(e.id, {
      id: e.id,
      type: e.type,
      value: e.normalized_value || e.value,
      confidence: e.confidence,
    });
  }

  if (!entityMap.has(fromEntityId)) {
    throw new Error(`Source entity ${fromEntityId} not found in this investigation`);
  }
  if (!entityMap.has(toEntityId)) {
    throw new Error(`Target entity ${toEntityId} not found in this investigation`);
  }

  // Same entity — trivial path
  if (fromEntityId === toEntityId) {
    const e = entityMap.get(fromEntityId)!;
    return {
      found: true,
      hops: [{
        entityId: e.id,
        entityType: e.type,
        entityValue: e.value,
        relationshipId: null,
        relationshipType: null,
        confidence: e.confidence,
      }],
      totalHops: 0,
      cumulativeConfidence: e.confidence,
    };
  }

  // Build adjacency list (undirected — relationships can be traversed both ways)
  const adj = new Map<string, AdjEntry[]>();
  for (const e of entities) {
    adj.set(e.id, []);
  }

  for (const rel of relationships) {
    const forward: AdjEntry = {
      neighborId: rel.target_entity_id,
      relationshipId: rel.id,
      relationshipType: rel.relationship_type,
      confidence: rel.confidence,
    };
    const backward: AdjEntry = {
      neighborId: rel.source_entity_id,
      relationshipId: rel.id,
      relationshipType: rel.relationship_type,
      confidence: rel.confidence,
    };

    adj.get(rel.source_entity_id)?.push(forward);
    adj.get(rel.target_entity_id)?.push(backward);
  }

  // BFS
  const visited = new Set<string>([fromEntityId]);
  const parent = new Map<string, { parentId: string; edge: AdjEntry }>();
  const queue: string[] = [fromEntityId];

  let found = false;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === toEntityId) {
      found = true;
      break;
    }

    const neighbors = adj.get(current) || [];
    for (const entry of neighbors) {
      if (!visited.has(entry.neighborId)) {
        visited.add(entry.neighborId);
        parent.set(entry.neighborId, { parentId: current, edge: entry });
        queue.push(entry.neighborId);
      }
    }
  }

  if (!found) {
    return {
      found: false,
      hops: [],
      totalHops: 0,
      cumulativeConfidence: 0,
    };
  }

  // Reconstruct path from toEntityId back to fromEntityId
  const pathIds: Array<{ entityId: string; relationshipId: string | null; relationshipType: string | null; confidence: number }> = [];
  let currentId = toEntityId;

  while (currentId !== fromEntityId) {
    const p = parent.get(currentId);
    if (!p) break;
    pathIds.unshift({
      entityId: currentId,
      relationshipId: p.edge.relationshipId,
      relationshipType: p.edge.relationshipType,
      confidence: p.edge.confidence,
    });
    currentId = p.parentId;
  }

  // Add the source entity at the beginning
  pathIds.unshift({
    entityId: fromEntityId,
    relationshipId: null,
    relationshipType: null,
    confidence: entityMap.get(fromEntityId)!.confidence,
  });

  // Build hops with entity details
  const hops: PathHop[] = pathIds.map((p) => {
    const e = entityMap.get(p.entityId)!;
    return {
      entityId: e.id,
      entityType: e.type,
      entityValue: e.value,
      relationshipId: p.relationshipId,
      relationshipType: p.relationshipType,
      confidence: p.confidence,
    };
  });

  // Cumulative confidence: product of relationship confidences along the path
  const relConfidences = hops
    .filter((h) => h.relationshipId !== null)
    .map((h) => h.confidence / 100);

  const cumulativeConfidence = relConfidences.length > 0
    ? Math.round(relConfidences.reduce((acc, c) => acc * c, 1) * 100)
    : hops[0]?.confidence || 0;

  logger.info('Path finder result', {
    caseId,
    from: fromEntityId,
    to: toEntityId,
    found: true,
    totalHops: hops.length - 1,
    cumulativeConfidence,
  });

  return {
    found: true,
    hops,
    totalHops: hops.length - 1,
    cumulativeConfidence,
  };
}
