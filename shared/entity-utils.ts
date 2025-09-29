import type { Entity } from './schema';

export type EntityLike = Partial<Entity> & Record<string, unknown>;

export function resolveEntityIdentifier(
  entity: EntityLike,
  options: { fallback?: string; preferredKeys?: string[] } = {}
): string {
  const preferred = options.preferredKeys ?? [
    'entity_name',
    'table_name',
    'dag_name',
    'name',
    'identifier',
  ];

  for (const key of preferred) {
    const value = entity?.[key as keyof EntityLike];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  if (options.fallback) {
    return options.fallback;
  }

  return '';
}

