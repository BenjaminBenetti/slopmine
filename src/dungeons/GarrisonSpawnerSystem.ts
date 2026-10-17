import * as THREE from 'three'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { playSound } from '../audio/SoundHooks.ts'
import type { EntityId, IEntity } from '../entities/interfaces/IEntity.ts'
import { EntityState } from '../entities/interfaces/IEntity.ts'
import {
  DEFAULT_GARRISON_ACTIVATION_HEIGHT,
  DEFAULT_GARRISON_ACTIVATION_RADIUS,
  DEFAULT_GARRISON_MAX_ALIVE,
  DEFAULT_GARRISON_RESPAWN_SECONDS,
  DEFAULT_GARRISON_SPAWN_RADIUS,
  getGarrisonDefinition,
  type GarrisonDefinition,
} from './GarrisonRegistry.ts'

/** World access the garrison system needs (wired by setupDungeons). */
export interface GarrisonWorld {
  getBlockIdFast(x: number, y: number, z: number): number
  getBlockMetadataFast(x: number, y: number, z: number): number
  isSolid(x: number, y: number, z: number): boolean
  /** Is the sub-chunk holding this block loaded? */
  isBlockLoaded(x: number, y: number, z: number): boolean
}

export interface GarrisonSystemDeps {
  world: GarrisonWorld
  addEntity(entity: IEntity): boolean
  removeEntity(id: EntityId): boolean
  /** The player's feet position (live reference). */
  playerPosition: THREE.Vector3
  isPlayerDead(): boolean
}

/** Garrison lifecycle: armed → fielded (members alive) → cooldown (player away) → armed. */
export type GarrisonPhase = 'armed' | 'fielded' | 'cooldown'

interface GarrisonRecord {
  readonly key: string
  readonly x: number
  readonly y: number
  readonly z: number
  /** Block entity standing for this spawner (null: not loaded). */
  ownerId: string | null
  members: IEntity[]
  phase: GarrisonPhase
  /** Members killed (not despawned) since fielding. */
  killed: number
  /** Seconds the player has been away during cooldown. */
  awayTimer: number
  /** Members whose death was counted. */
  counted: Set<IEntity>
}

function garrisonKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

/**
 * Drives every loaded garrison spawner (`BlockIds.GARRISON_SPAWNER`,
 * metadata = garrison index):
 *
 * - armed + player within the definition's activationRadius (horizontal)
 *   and activationHeight → fields `maxAlive` members (on standable cells
 *   around the spawner) through the EntityManager, once;
 * - members are tracked; when none is left: if the player killed any, the
 *   garrison cools down and re-arms only after `respawnSeconds` of the
 *   player being away (beyond 2 × the activation radius); if they all
 *   despawned without a kill it re-arms at once;
 * - the spawner's sub-chunk unloading removes its members (they never
 *   outlive the room, never fall through unloaded ground) and re-arms it
 *   unless the player had already fought it; the garrison's phase is kept
 *   per spawner for the session, so reloading the chunk never duplicates
 *   or refreshes a garrison early.
 */
export class GarrisonSpawnerSystem {
  private deps: GarrisonSystemDeps | null = null
  private readonly records = new Map<string, GarrisonRecord>()
  private readonly warned = new Set<string>()
  private readonly spawnPos = new THREE.Vector3()

  attach(deps: GarrisonSystemDeps): void {
    this.deps = deps
  }

  onSpawnerLoaded(x: number, y: number, z: number, ownerId: string): void {
    const key = garrisonKey(x, y, z)
    const record = this.records.get(key)
    if (record) {
      record.ownerId = ownerId
      return
    }
    this.records.set(key, { key, x, y, z, ownerId, members: [], phase: 'armed', killed: 0, awayTimer: 0, counted: new Set() })
  }

  onSpawnerUnloaded(x: number, y: number, z: number, ownerId: string): void {
    const record = this.records.get(garrisonKey(x, y, z))
    if (!record || record.ownerId !== ownerId) return
    record.ownerId = null
    const loaded = this.deps?.world.isBlockLoaded(x, y, z) ?? false
    if (loaded) {
      // The block changed (mined): its living members fight on, untracked
      this.records.delete(record.key)
      return
    }
    // Unloaded: take the members with it; an unfought garrison re-arms
    this.dismissMembers(record)
    if (record.phase === 'fielded') record.phase = record.killed > 0 ? 'cooldown' : 'armed'
  }

  /** Spawners currently tracked (debug). */
  get spawnerCount(): number {
    let n = 0
    for (const record of this.records.values()) if (record.ownerId !== null) n++
    return n
  }

  /** Phase + live member count of a spawner (debug/tests). */
  getState(x: number, y: number, z: number): { phase: GarrisonPhase; alive: number; killed: number } | null {
    const record = this.records.get(garrisonKey(x, y, z))
    return record ? { phase: record.phase, alive: record.members.length, killed: record.killed } : null
  }

  update(deltaTime: number): void {
    const deps = this.deps
    if (!deps) return
    const player = deps.playerPosition
    const dead = deps.isPlayerDead()
    for (const record of this.records.values()) {
      if (record.ownerId === null) continue
      const { x, y, z } = record
      if (deps.world.getBlockIdFast(x, y, z) !== BlockIds.GARRISON_SPAWNER) continue
      const index = deps.world.getBlockMetadataFast(x, y, z)
      const def = getGarrisonDefinition(index)
      if (!def) {
        if (!this.warned.has(record.key)) {
          this.warned.add(record.key)
          console.warn(`[GarrisonSpawner] spawner at ${record.key} has no registered garrison for index ${index}`)
        }
        continue
      }

      this.pruneMembers(record)
      const radius = def.activationRadius ?? DEFAULT_GARRISON_ACTIVATION_RADIUS
      const height = def.activationHeight ?? DEFAULT_GARRISON_ACTIVATION_HEIGHT
      const dx = player.x - (x + 0.5)
      const dz = player.z - (z + 0.5)
      const d2 = dx * dx + dz * dz
      const dy = Math.abs(player.y - (y + 1))

      switch (record.phase) {
        case 'armed':
          if (!dead && d2 <= radius * radius && dy <= height) this.field(record, def)
          break
        case 'fielded':
          if (record.members.length === 0) {
            record.phase = record.killed > 0 ? 'cooldown' : 'armed'
            record.awayTimer = 0
          }
          break
        case 'cooldown': {
          const away = d2 > 4 * radius * radius || dy > height * 2 || dead
          record.awayTimer = away ? record.awayTimer + deltaTime : 0
          if (record.awayTimer >= (def.respawnSeconds ?? DEFAULT_GARRISON_RESPAWN_SECONDS)) {
            record.phase = 'armed'
            record.killed = 0
          }
          break
        }
      }
    }
  }

  private field(record: GarrisonRecord, def: GarrisonDefinition): void {
    const deps = this.deps!
    const count = Math.max(1, def.maxAlive ?? DEFAULT_GARRISON_MAX_ALIVE)
    record.members = []
    record.killed = 0
    record.counted = new Set()
    for (let slot = 0; slot < count; slot++) {
      const position = this.findSpawnPosition(record, def, slot, count)
      let member: IEntity
      try {
        member = def.create(position, slot)
      } catch (error) {
        console.error(`[GarrisonSpawner] '${def.id}' create threw:`, error)
        continue
      }
      if (deps.addEntity(member)) record.members.push(member)
    }
    record.phase = 'fielded'
    if (record.members.length > 0) playSound('spawner.wake', { x: record.x + 0.5, y: record.y + 0.5, z: record.z + 0.5 })
  }

  /** A standable cell (solid below, 2 non-solid above) around the spawner for this slot. */
  private findSpawnPosition(record: GarrisonRecord, def: GarrisonDefinition, slot: number, count: number): THREE.Vector3 {
    const world = this.deps!.world
    const spread = def.spawnRadius ?? DEFAULT_GARRISON_SPAWN_RADIUS
    const baseAngle = (slot / count) * Math.PI * 2 + 0.6
    for (let r = spread; r >= 1; r--) {
      for (let k = 0; k < 4; k++) {
        const angle = baseAngle + k * 0.7
        const px = Math.floor(record.x + 0.5 + Math.cos(angle) * r)
        const pz = Math.floor(record.z + 0.5 + Math.sin(angle) * r)
        for (const py of [record.y + 1, record.y + 2, record.y]) {
          if (world.isSolid(px, py - 1, pz) && !world.isSolid(px, py, pz) && !world.isSolid(px, py + 1, pz)) {
            return this.spawnPos.set(px + 0.5, py, pz + 0.5).clone()
          }
        }
      }
    }
    return new THREE.Vector3(record.x + 0.5, record.y + 1, record.z + 0.5)
  }

  /** Drop members that left the world; count each one that died, once. */
  private pruneMembers(record: GarrisonRecord): void {
    if (record.members.length === 0) return
    record.members = record.members.filter((member) => {
      if (member.isDying === true && !record.counted.has(member)) {
        record.counted.add(member)
        record.killed++
      }
      return !(member.state === EntityState.DISPOSED || member.state === EntityState.DESPAWNING || !member.isAlive)
    })
  }

  private dismissMembers(record: GarrisonRecord): void {
    const deps = this.deps
    for (const member of record.members) {
      if (member.state !== EntityState.DISPOSED) deps?.removeEntity(member.id)
    }
    record.members = []
  }
}

/** The game's garrison spawner system (block entities register with it). */
export const garrisonSpawners = new GarrisonSpawnerSystem()
