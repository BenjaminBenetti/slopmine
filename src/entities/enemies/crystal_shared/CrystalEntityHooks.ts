import type { IEntity } from '../../interfaces/IEntity.ts'

/**
 * Lets Crystal Abyss mobs add entities to the world (a shattering shardling
 * splits into fragments) without depending on the EntityManager instance.
 * Wired once from main.ts (the crystal section of the depth wiring).
 */
let spawner: ((entity: IEntity) => void) | null = null

export function setCrystalEntitySpawner(spawn: (entity: IEntity) => void): void {
  spawner = spawn
}

/** Add an entity to the world; a no-op until the spawner is wired. */
export function spawnCrystalEntity(entity: IEntity): void {
  spawner?.(entity)
}
