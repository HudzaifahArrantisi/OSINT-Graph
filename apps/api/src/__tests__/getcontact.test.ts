import { describe, it, expect, vi } from 'vitest';
import child_process from 'node:child_process';
import { getcontactCollector } from '../collectors/getcontact.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { TRANSFORMS } from '../transforms/definitions.js';

describe('getcontact collector & transform integration', () => {
  it('supports PHONE input type', () => {
    expect(getcontactCollector.supports('PHONE')).toBe(true);
    expect(getcontactCollector.supports('EMAIL')).toBe(false);
  });

  it('is registered in discovery planner for PHONE', () => {
    const plan = buildDiscoveryPlan('PHONE', '+6281234567890');
    expect(
      plan.transforms.some((t) => t.id === 'contact.getcontact-intelligence'),
    ).toBe(true);
  });

  it('has valid metadata in TRANSFORMS definitions', () => {
    const def = TRANSFORMS.find((t) => t.id === 'contact.getcontact-intelligence');
    expect(def).toBeDefined();
    expect(def?.category).toBe('contact');
    expect(def?.input).toBe('PHONE');
    expect(def?.output).toContain('PERSON');
    expect(def?.output).toContain('PUBLIC_MENTION');
  });

  it('parses gtc tags output and extracts PERSON and PUBLIC_MENTION entities', async () => {
    const mockOutput = JSON.stringify({
      tags: [
        { tag: 'Hudzaifah Arrantisi', count: 12 },
        { tag: 'Hudzaifah Teman Kampus', count: 5 },
        { tag: 'Zai Cyber Analyst', count: 3 },
      ],
      profile: {
        name: 'Hudzaifah Arrantisi',
        phone: '+6281234567890',
      },
    });

    vi.spyOn(child_process, 'execFile').mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(null, mockOutput, '');
      return {} as any;
    });

    const result = await getcontactCollector.run('+6281234567890', {
      requestId: 'test-gtc-req',
      caseId: 'test-case',
      signal: AbortSignal.timeout(5000),
    });

    expect(result.source).toBe('getcontact');

    // Should emit PHONE
    const phoneEntity = result.entities.find((e) => e.type === 'PHONE');
    expect(phoneEntity).toBeDefined();

    // Should emit PERSON (displayName)
    const personEntity = result.entities.find(
      (e) => e.type === 'PERSON' && e.value === 'Hudzaifah Arrantisi',
    );
    expect(personEntity).toBeDefined();

    // Should emit PUBLIC_MENTION (contact tags)
    const tags = result.entities.filter((e) => e.type === 'PUBLIC_MENTION');
    expect(tags.length).toBe(3);
    expect(tags.some((t) => t.value.includes('Hudzaifah Teman Kampus'))).toBe(true);
    expect(tags.some((t) => t.value.includes('Zai Cyber Analyst'))).toBe(true);

    // Relationships
    expect(
      result.relationships.some(
        (r) =>
          r.source_type === 'PHONE' &&
          r.target_type === 'PERSON' &&
          r.relationship_type === 'BELONGS_TO',
      ),
    ).toBe(true);

    expect(
      result.relationships.some(
        (r) =>
          r.source_type === 'PHONE' &&
          r.target_type === 'PUBLIC_MENTION' &&
          r.relationship_type === 'MENTIONS',
      ),
    ).toBe(true);
  });
});
