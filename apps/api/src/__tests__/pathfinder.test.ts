import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findShortestPath } from '../correlation/pathfinder.js';
import * as supabaseLib from '../lib/supabase.js';

describe('Path Finder (BFS Shortest Path)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws error when user does not own the investigation', async () => {
    vi.spyOn(supabaseLib, 'getSupabaseAdmin').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any);

    await expect(
      findShortestPath('case-1', 'ent-1', 'ent-2', 'user-other'),
    ).rejects.toThrow('Investigation not found or access denied');
  });

  it('returns trivial 0-hop path when source and target are the same entity', async () => {
    vi.spyOn(supabaseLib, 'getSupabaseAdmin').mockReturnValue({
      from: (table: string) => {
        if (table === 'investigations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: 'case-1' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'entities') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { id: 'ent-1', type: 'DOMAIN', value: 'example.com', normalized_value: 'example.com', confidence: 90 },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'relationships') {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          };
        }
        return {} as any;
      },
    } as any);

    const result = await findShortestPath('case-1', 'ent-1', 'ent-1', 'user-1');
    expect(result.found).toBe(true);
    expect(result.totalHops).toBe(0);
    expect(result.hops.length).toBe(1);
    expect(result.hops[0].entityId).toBe('ent-1');
    expect(result.cumulativeConfidence).toBe(90);
  });

  it('finds direct 1-hop path between two connected entities', async () => {
    const mockEntities = [
      { id: 'ent-domain', type: 'DOMAIN', value: 'target.com', normalized_value: 'target.com', confidence: 90 },
      { id: 'ent-ip', type: 'IP_ADDRESS', value: '93.184.216.34', normalized_value: '93.184.216.34', confidence: 85 },
    ];
    const mockRelationships = [
      {
        id: 'rel-1',
        source_entity_id: 'ent-domain',
        target_entity_id: 'ent-ip',
        relationship_type: 'RESOLVES_TO',
        confidence: 90,
      },
    ];

    vi.spyOn(supabaseLib, 'getSupabaseAdmin').mockReturnValue({
      from: (table: string) => {
        if (table === 'investigations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: 'case-1' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'entities') {
          return {
            select: () => ({
              eq: async () => ({ data: mockEntities, error: null }),
            }),
          };
        }
        if (table === 'relationships') {
          return {
            select: () => ({
              eq: async () => ({ data: mockRelationships, error: null }),
            }),
          };
        }
        return {} as any;
      },
    } as any);

    const result = await findShortestPath('case-1', 'ent-domain', 'ent-ip', 'user-1');
    expect(result.found).toBe(true);
    expect(result.totalHops).toBe(1);
    expect(result.hops.length).toBe(2);
    expect(result.hops[0].entityId).toBe('ent-domain');
    expect(result.hops[1].entityId).toBe('ent-ip');
    expect(result.hops[1].relationshipType).toBe('RESOLVES_TO');
    expect(result.cumulativeConfidence).toBe(90);
  });

  it('finds multi-hop shortest path across intermediate entities', async () => {
    // Chain: Email -> Username -> Github -> Domain
    const mockEntities = [
      { id: 'e1', type: 'EMAIL', value: 'dev@target.com', normalized_value: 'dev@target.com', confidence: 95 },
      { id: 'e2', type: 'USERNAME', value: 'devtarget', normalized_value: 'devtarget', confidence: 80 },
      { id: 'e3', type: 'GITHUB_PROFILE', value: 'https://github.com/devtarget', normalized_value: 'https://github.com/devtarget', confidence: 90 },
      { id: 'e4', type: 'DOMAIN', value: 'target.com', normalized_value: 'target.com', confidence: 90 },
    ];
    const mockRelationships = [
      { id: 'r1', source_entity_id: 'e1', target_entity_id: 'e2', relationship_type: 'POSSIBLY_SAME_AS', confidence: 80 },
      { id: 'r2', source_entity_id: 'e2', target_entity_id: 'e3', relationship_type: 'HAS_GITHUB', confidence: 90 },
      { id: 'r3', source_entity_id: 'e3', target_entity_id: 'e4', relationship_type: 'LINKS_TO', confidence: 85 },
    ];

    vi.spyOn(supabaseLib, 'getSupabaseAdmin').mockReturnValue({
      from: (table: string) => {
        if (table === 'investigations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: 'case-1' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'entities') {
          return {
            select: () => ({
              eq: async () => ({ data: mockEntities, error: null }),
            }),
          };
        }
        if (table === 'relationships') {
          return {
            select: () => ({
              eq: async () => ({ data: mockRelationships, error: null }),
            }),
          };
        }
        return {} as any;
      },
    } as any);

    const result = await findShortestPath('case-1', 'e1', 'e4', 'user-1');
    expect(result.found).toBe(true);
    expect(result.totalHops).toBe(3);
    expect(result.hops.map((h) => h.entityId)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(result.cumulativeConfidence).toBeGreaterThan(0);
  });

  it('returns found: false when two entities are not connected', async () => {
    const mockEntities = [
      { id: 'e1', type: 'EMAIL', value: 'island1@test.com', normalized_value: 'island1@test.com', confidence: 90 },
      { id: 'e2', type: 'DOMAIN', value: 'island2.com', normalized_value: 'island2.com', confidence: 90 },
    ];

    vi.spyOn(supabaseLib, 'getSupabaseAdmin').mockReturnValue({
      from: (table: string) => {
        if (table === 'investigations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: { id: 'case-1' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'entities') {
          return {
            select: () => ({
              eq: async () => ({ data: mockEntities, error: null }),
            }),
          };
        }
        if (table === 'relationships') {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          };
        }
        return {} as any;
      },
    } as any);

    const result = await findShortestPath('case-1', 'e1', 'e2', 'user-1');
    expect(result.found).toBe(false);
    expect(result.hops.length).toBe(0);
    expect(result.totalHops).toBe(0);
    expect(result.cumulativeConfidence).toBe(0);
  });
});
