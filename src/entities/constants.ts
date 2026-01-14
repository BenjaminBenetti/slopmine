/**
 * Default hitbox dimensions for common entity types.
 */
export const ENTITY_HITBOX = {
  /** Standard mob (similar to player) */
  STANDARD: { width: 0.6, height: 1.8, depth: 0.6 },
  /** Small mob (chicken, rabbit) */
  SMALL: { width: 0.4, height: 0.7, depth: 0.4 },
  /** Large mob (cow, pig) */
  LARGE: { width: 0.9, height: 1.4, depth: 0.9 },
  /** Item drop */
  ITEM: { width: 0.25, height: 0.25, depth: 0.25 },
  /** Projectile (arrow) */
  PROJECTILE: { width: 0.1, height: 0.1, depth: 0.5 },
} as const

/**
 * Maximum reach distance for player entity interactions.
 */
export const ENTITY_INTERACTION_DISTANCE = 4.0

/**
 * Default despawn distance (entities beyond this are removed).
 */
export const ENTITY_DESPAWN_DISTANCE = 128

/**
 * Item drop pickup distance.
 */
export const ITEM_PICKUP_DISTANCE = 2.0
