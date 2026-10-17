import type { IItem } from '../items/Item.ts'

/**
 * Game services guardians need beyond what EntityManager wires into every
 * entity (player position, damage callback, world queries, entity spawning):
 * set once by setupDungeons() on the main thread. Null until then (and in
 * isolated tests), so every use must tolerate it.
 */
export interface DungeonServices {
  /** Scatter items as dropped item entities around a world position. */
  spawnDrops(items: IItem[], x: number, y: number, z: number): void
  /** True while the player is dead (guardians stop fighting). */
  isPlayerDead(): boolean
}

let services: DungeonServices | null = null

export function setDungeonServices(value: DungeonServices | null): void {
  services = value
}

export function getDungeonServices(): DungeonServices | null {
  return services
}
