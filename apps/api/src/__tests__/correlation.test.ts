import { describe, it, expect } from 'vitest';
import { calculateConfidence, correlateEntities } from '../correlation/engine.js';
import type { Entity, EntityCandidate } from '@nexusgraph/shared';

describe('Correlation Engine & Confidence Scoring Tests', () => {
  it('should clamp confidence score between 0 and 100', () => {
    expect(calculateConfidence([40, 30, 20, 10, 50])).toBe(100);
    expect(calculateConfidence([-30, -50])).toBe(0);
    expect(calculateConfidence([40, 30])).toBe(70);
  });

  it('should correlate exact email matches as SAME_AS with high confidence', () => {
    const existingEntities: Entity[] = [
      {
        id: '1',
        case_id: 'case-1',
        type: 'EMAIL',
        value: 'analyst@target.com',
        normalized_value: 'analyst@target.com',
        title: null,
        metadata: {},
        confidence: 80,
        first_seen: null,
        last_seen: null,
        created_at: '',
        updated_at: '',
      },
    ];

    const candidates: EntityCandidate[] = [
      {
        type: 'EMAIL',
        value: 'analyst@target.com',
      },
    ];

    const relationships = correlateEntities(existingEntities, candidates);
    expect(relationships.length).toBeGreaterThan(0);
    expect(relationships[0].relationship_type).toBe('SAME_AS');
    expect(relationships[0].confidence).toBeGreaterThanOrEqual(70);
  });

  it('should correlate username matches as POSSIBLY_SAME_AS with explainable reason', () => {
    const existingEntities: Entity[] = [
      {
        id: '1',
        case_id: 'case-1',
        type: 'USERNAME',
        value: 'testuser',
        normalized_value: 'testuser',
        title: null,
        metadata: {},
        confidence: 70,
        first_seen: null,
        last_seen: null,
        created_at: '',
        updated_at: '',
      },
    ];

    const candidates: EntityCandidate[] = [
      {
        type: 'USERNAME',
        value: 'testuser',
      },
    ];

    const relationships = correlateEntities(existingEntities, candidates);
    expect(relationships.length).toBeGreaterThan(0);
    expect(relationships[0].relationship_type).toBe('POSSIBLY_SAME_AS');
    expect(relationships[0].reason).toContain('does not confirm identity');
  });

  it('should correlate domain and IP as RESOLVES_TO', () => {
    const existingEntities: Entity[] = [
      {
        id: '1',
        case_id: 'case-1',
        type: 'DOMAIN',
        value: 'example.com',
        normalized_value: 'example.com',
        title: null,
        metadata: {},
        confidence: 90,
        first_seen: null,
        last_seen: null,
        created_at: '',
        updated_at: '',
      },
    ];

    const candidates: EntityCandidate[] = [
      {
        type: 'IP_ADDRESS',
        value: '93.184.216.34',
      },
    ];

    const relationships = correlateEntities(existingEntities, candidates);
    expect(relationships.length).toBe(1);
    expect(relationships[0].relationship_type).toBe('RESOLVES_TO');
    expect(relationships[0].confidence).toBeGreaterThan(70);
  });
});
