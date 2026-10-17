import * as THREE from 'three'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import type { IItem } from '../items/Item.ts'
import type { GuardianEntity, GuardianSpawnLink } from '../entities/guardians/GuardianEntity.ts'
import {
  DEFAULT_GUARDIAN_ACTIVATION_HEIGHT,
  DEFAULT_GUARDIAN_ACTIVATION_RADIUS,
  getGuardianDefinition,
} from './GuardianRegistry.ts'

/** The world access the spawner system needs (WorldManager satisfies it via setupDungeons). */
export interface SpawnerWorld {
  getBlockIdFast(x: number, y: number, z: number): number
  getBlockMetadataFast(x: number, y: number, z: number): number
  /** Is the sub-chunk holding this block loaded? */
  isBlockLoaded(x: number, y: number, z: number): boolean
  setBlock(x: bigint, y: bigint, z: bigint, blockId: number, metadata?: number): boolean
}

export interface SpawnerSystemDeps {
  world: SpawnerWorld
  addEntity(entity: IEntity): boolean
  /** The player's feet position (live reference). */
  playerPosition: THREE.Vector3
  isPlayerDead(): boolean
  /**
   * Put a defeated guardian's loot in a reward chest by its altar (x, y, z).
   * Returns the items that did not fit, or null when no chest could be placed.
   */
  placeRewardChest?(x: number, y: number, z: number, items: IItem[]): IItem[] | null
  /** Scatter items as dropped item entities (loot that found no chest). */
  spawnDrops?(items: IItem[], x: number, y: number, z: number): void
}

/** Seconds after a guardian vanished (not defeated) before its spawner may summon again. */
const REARM_DELAY = 2

interface SpawnerRecord {
  readonly key: string
  readonly x: number
  readonly y: number
  readonly z: number
  /** Id of the block entity standing for this spawner (null: not loaded). */
  ownerId: string | null
  guardian: GuardianEntity | null
  rearmTimer: number
}

function spawnerKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

/**
 * Drives every loaded guardian spawner block:
 *
 * - An armed spawner (`GUARDIAN_SPAWNER`, metadata = guardian index)
 *   summons its registered guardian when the player comes within the
 *   guardian's activation radius and height band. One live guardian per
 *   spawner.
 * - If the guardian leaves the world without dying (distance despawn,
 *   spawner's sub-chunk unloaded, reset), the spawner re-arms.
 * - When the guardian dies the block becomes `GUARDIAN_SPAWNER_SPENT`
 *   (a normal setBlock, so it persists with the chunk) and, in the same
 *   call, its loot goes into a reward chest on/beside the altar (a player
 *   style chest, saved with the same sub-chunk saves). If the block's
 *   sub-chunk is not loaded at that moment, both happen when it loads again
 *   (this session). Loot that finds no chest cell is spilled.
 *
 * Spawner block entities (GuardianSpawnerBlockEntity, created by the world
 * on every sub-chunk apply - generated or loaded) report load/unload here;
 * a guardian never outlives its spawner's sub-chunk (it is dismissed and the
 * spawner re-arms when it loads again).
 */
export class GuardianSpawnerSystem {
  private deps: SpawnerSystemDeps | null = null
  private readonly records = new Map<string, SpawnerRecord>()
  /** Spawners whose guardian died while their block was not loaded. */
  private readonly pendingSpent = new Set<string>()
  /** Loot of those guardians, for their reward chest. */
  private readonly pendingLoot = new Map<string, IItem[]>()
  private readonly warnedKeys = new Set<string>()

  /** Connect to the game (setupDungeons). Until then spawners only register. */
  attach(deps: SpawnerSystemDeps): void {
    this.deps = deps
  }

  /** A spawner block entity spawned (its sub-chunk loaded, or the block was placed). */
  onSpawnerLoaded(x: number, y: number, z: number, ownerId: string): void {
    const key = spawnerKey(x, y, z)
    const record = this.records.get(key)
    if (record) {
      record.ownerId = ownerId
      return
    }
    this.records.set(key, { key, x, y, z, ownerId, guardian: null, rearmTimer: 0 })
  }

  /** A spawner block entity despawned (sub-chunk unloaded, or the block changed). */
  onSpawnerUnloaded(x: number, y: number, z: number, ownerId: string): void {
    const key = spawnerKey(x, y, z)
    const record = this.records.get(key)
    // A newer block entity for the same cell may already have taken over
    if (!record || record.ownerId !== ownerId) return
    record.ownerId = null

    const guardian = record.guardian
    const world = this.deps?.world
    const cellLoaded = world ? world.isBlockLoaded(x, y, z) : false
    if (guardian && !guardian.isDefeated && !cellLoaded) {
      // The arena unloaded under the guardian: dismiss it, re-arm on reload
      guardian.dismiss()
    }
    // A loaded cell that is no longer a spawner was mined or spent: a live
    // guardian keeps fighting (its link just stops pointing anywhere)
    if (!guardian || guardian.isDefeated || !cellLoaded) {
      this.records.delete(key)
    }
  }

  /** Number of tracked spawners (debug/FPS overlay). */
  get spawnerCount(): number {
    return this.records.size
  }

  /** Live guardians summoned by spawners. */
  getActiveGuardians(): GuardianEntity[] {
    const guardians: GuardianEntity[] = []
    for (const record of this.records.values()) {
      if (record.guardian) guardians.push(record.guardian)
    }
    return guardians
  }

  update(deltaTime: number): void {
    const deps = this.deps
    if (!deps) return
    const player = deps.playerPosition
    const playerDead = deps.isPlayerDead()

    for (const record of this.records.values()) {
      if (record.ownerId === null) continue
      const { x, y, z } = record
      if (deps.world.getBlockIdFast(x, y, z) !== BlockIds.GUARDIAN_SPAWNER) continue

      if (this.pendingSpent.has(record.key)) {
        this.markSpent(record)
        const loot = this.pendingLoot.get(record.key)
        this.pendingLoot.delete(record.key)
        if (loot && !this.storeLoot(record, loot)) {
          this.deps?.spawnDrops?.(loot, record.x + 0.5, record.y + 1.5, record.z + 0.5)
        }
        continue
      }
      if (record.guardian) continue
      if (record.rearmTimer > 0) {
        record.rearmTimer -= deltaTime
        continue
      }
      if (playerDead) continue

      const index = deps.world.getBlockMetadataFast(x, y, z)
      const definition = getGuardianDefinition(index)
      if (!definition) {
        if (!this.warnedKeys.has(record.key)) {
          this.warnedKeys.add(record.key)
          console.warn(`[GuardianSpawner] spawner at ${record.key} has no registered guardian for index ${index}`)
        }
        continue
      }

      const radius = definition.activationRadius ?? DEFAULT_GUARDIAN_ACTIVATION_RADIUS
      const height = definition.activationHeight ?? DEFAULT_GUARDIAN_ACTIVATION_HEIGHT
      const dx = player.x - (x + 0.5)
      const dz = player.z - (z + 0.5)
      if (dx * dx + dz * dz > radius * radius || Math.abs(player.y - y) > height) continue

      this.summon(record, definition.create(new THREE.Vector3(x + 0.5, y + 1, z + 0.5)))
    }
  }

  private summon(record: SpawnerRecord, guardian: GuardianEntity): void {
    const link: GuardianSpawnLink = {
      onGuardianDefeated: (_guardian, loot) => this.onGuardianDefeated(record, loot),
      onGuardianRemoved: (removed) => {
        if (record.guardian !== removed) return
        record.guardian = null
        record.rearmTimer = REARM_DELAY
        // An unloaded spawner's record is kept only for its live guardian
        if (record.ownerId === null && this.records.get(record.key) === record) this.records.delete(record.key)
      },
    }
    guardian.attachSpawnLink(link)
    if (!this.deps!.addEntity(guardian)) {
      guardian.attachSpawnLink(null)
      record.rearmTimer = REARM_DELAY
      return
    }
    record.guardian = guardian
  }

  /** @returns whether the loot was taken (reward chest, or kept for it) */
  private onGuardianDefeated(record: SpawnerRecord, loot: IItem[]): boolean {
    const world = this.deps?.world
    if (!world || !world.isBlockLoaded(record.x, record.y, record.z)) {
      this.pendingSpent.add(record.key)
      if (loot.length > 0) this.pendingLoot.set(record.key, loot)
      return true
    }
    // Spent altar and reward chest are written together: a save holds both or neither
    this.markSpent(record)
    return this.storeLoot(record, loot)
  }

  /** Loot into a reward chest by the altar (overflow spilled). False: no chest. */
  private storeLoot(record: SpawnerRecord, loot: IItem[]): boolean {
    if (loot.length === 0) return true
    const leftover = this.deps?.placeRewardChest?.(record.x, record.y, record.z, loot)
    if (!leftover) return false
    if (leftover.length > 0) this.deps?.spawnDrops?.(leftover, record.x + 0.5, record.y + 1.5, record.z + 0.5)
    return true
  }

  private markSpent(record: SpawnerRecord): void {
    const world = this.deps!.world
    this.pendingSpent.delete(record.key)
    if (world.getBlockIdFast(record.x, record.y, record.z) !== BlockIds.GUARDIAN_SPAWNER) return
    // Keep the guardian index in the metadata (which dungeon this altar served)
    const index = world.getBlockMetadataFast(record.x, record.y, record.z)
    world.setBlock(BigInt(record.x), BigInt(record.y), BigInt(record.z), BlockIds.GUARDIAN_SPAWNER_SPENT, index)
  }
}

/** The game's guardian spawner system (block entities register with it). */
export const guardianSpawners = new GuardianSpawnerSystem()
