import type * as THREE from 'three'
import type { IEntity } from '../entities/interfaces/IEntity.ts'

/**
 * Garrisons: the enemies a dungeon room fields when the player comes near.
 * A worker kit places a garrison spawner (`BlockIds.GARRISON_SPAWNER`,
 * metadata = garrison index - `ctx.garrison(x, y, z, index)` in a module
 * builder); the main-thread GarrisonSpawnerSystem fields `create()` members
 * through the EntityManager. Register from your biome's setup function.
 *
 * Index ranges: castlekit test kit 1-9, molten 10-19, ossuary 20-29,
 * embergrove 30-39, crystal 40-49, cocytus 50-59.
 */

export const DEFAULT_GARRISON_MAX_ALIVE = 3
export const DEFAULT_GARRISON_ACTIVATION_RADIUS = 10
export const DEFAULT_GARRISON_ACTIVATION_HEIGHT = 5
export const DEFAULT_GARRISON_RESPAWN_SECONDS = 600
export const DEFAULT_GARRISON_SPAWN_RADIUS = 3

export interface GarrisonDefinition {
  /** Unique id, e.g. 'bastion_barracks'. */
  readonly id: string
  /** 1-255, written into the spawner block's metadata by worldgen. */
  readonly index: number
  readonly displayName?: string
  /** Members fielded at once (default 3). */
  readonly maxAlive?: number
  /** Horizontal player distance that wakes the garrison (default 10). */
  readonly activationRadius?: number
  /** Max |player Y - spawner Y| (default 5). */
  readonly activationHeight?: number
  /** Re-arm after this many seconds with the player away and no member alive (default 600). */
  readonly respawnSeconds?: number
  /** Members appear on standable cells within this radius of the spawner (default 3). */
  readonly spawnRadius?: number
  /**
   * Build one member. `position` is its feet position (standable, near the
   * spawner); `slot` is 0..maxAlive-1 (e.g. slot 0 = the sergeant).
   */
  create(position: THREE.Vector3, slot: number): IEntity
}

const byIndex = new Map<number, GarrisonDefinition>()
const byId = new Map<string, GarrisonDefinition>()

/** Register a garrison. A later registration for the same index replaces the earlier one (warned). */
export function registerGarrison(definition: GarrisonDefinition): void {
  const { index, id } = definition
  if (!Number.isInteger(index) || index < 1 || index > 255) {
    console.error(`[GarrisonRegistry] '${id}': index must be an integer 1-255 (got ${index})`)
    return
  }
  const previous = byIndex.get(index)
  if (previous && previous.id !== id) {
    console.warn(`[GarrisonRegistry] index ${index} re-registered: '${previous.id}' -> '${id}'`)
    byId.delete(previous.id)
  }
  byIndex.set(index, definition)
  byId.set(id, definition)
}

/** The garrison a spawner with this metadata index fields, if registered. */
export function getGarrisonDefinition(index: number): GarrisonDefinition | undefined {
  return byIndex.get(index)
}

export function getGarrisonDefinitionById(id: string): GarrisonDefinition | undefined {
  return byId.get(id)
}

/** One entry of a weighted member table. */
export interface GarrisonMemberEntry {
  readonly weight: number
  create(position: THREE.Vector3, slot: number): IEntity
}

/**
 * `create` for a mixed garrison: picks a member type per slot by weight;
 * `fixed` slots (e.g. `{ 0: captain }`) always use their entry.
 */
export function weightedGarrisonMembers(
  entries: readonly GarrisonMemberEntry[],
  fixed: Readonly<Record<number, GarrisonMemberEntry>> = {}
): (position: THREE.Vector3, slot: number) => IEntity {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0)
  return (position, slot) => {
    const pinned = fixed[slot]
    if (pinned) return pinned.create(position, slot)
    let roll = Math.random() * total
    for (const entry of entries) {
      roll -= Math.max(0, entry.weight)
      if (roll < 0) return entry.create(position, slot)
    }
    return entries[entries.length - 1].create(position, slot)
  }
}
