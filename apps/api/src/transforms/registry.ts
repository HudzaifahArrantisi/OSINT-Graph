/**
 * Transform Registry — lookup transforms by ID, input type, or category.
 * Wraps the static definitions and provides query methods.
 */

import type { TransformDefinition, EntityType, TransformCategory } from '@nexusgraph/shared';
import { TRANSFORM_DEFINITIONS } from './definitions.js';

const transformMap = new Map<string, TransformDefinition>();

for (const def of TRANSFORM_DEFINITIONS) {
  transformMap.set(def.id, def);
}

/** Get a specific transform by ID */
export function getTransform(id: string): TransformDefinition | undefined {
  return transformMap.get(id);
}

/** Get all registered transforms */
export function getAllTransforms(): TransformDefinition[] {
  return TRANSFORM_DEFINITIONS.filter((t) => t.enabled);
}

/** Get transforms compatible with a given entity/input type */
export function getTransformsForInput(inputType: EntityType): TransformDefinition[] {
  return TRANSFORM_DEFINITIONS.filter(
    (t) => t.enabled && t.inputTypes.includes(inputType),
  );
}

/** Get transforms by category */
export function getTransformsByCategory(category: TransformCategory): TransformDefinition[] {
  return TRANSFORM_DEFINITIONS.filter(
    (t) => t.enabled && t.category === category,
  );
}

/** Get transforms grouped by category for UI display */
export function getTransformsGroupedByCategory(
  inputType?: EntityType,
): Record<string, TransformDefinition[]> {
  const transforms = inputType
    ? getTransformsForInput(inputType)
    : getAllTransforms();

  const grouped: Record<string, TransformDefinition[]> = {};

  for (const t of transforms) {
    if (!grouped[t.category]) {
      grouped[t.category] = [];
    }
    grouped[t.category].push(t);
  }

  return grouped;
}
