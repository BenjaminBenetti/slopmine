import * as THREE from 'three'
import type { ITask, ITaskResult } from '../../core/interfaces/ITask.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { EntityManager } from '../EntityManager.ts'
import type { WorldGenerator } from '../../world/generate/WorldGenerator.ts'
import type { WorldManager } from '../../world/WorldManager.ts'
import type { IPhysicsBody } from '../../physics/interfaces/IPhysicsBody.ts'
import type { EntitySpawnConfig } from './EntitySpawnConfig.ts'
import { BlockTags } from '../../world/blocks/tags/BlockTags.ts'

/**
 * Extra spawn configs for a biome on top of its own `entitySpawns` (night
 * creatures are registered by setupNightfall this way, so biome generators -
 * also loaded by the generation workers - never import them).
 */
export type EntitySpawnProvider = (
  biome: string,
  layer: 0 | 1,
  /** The candidate chunk's centre (X/Z) and the player's Y (spawns search ground near it). */
  position: { readonly x: number; readonly y: number; readonly z: number },
) => readonly EntitySpawnConfig[] | undefined

// Spawning constants
const SPAWN_CHECK_INTERVAL = 20.0 // seconds between spawn checks (faster cycle)
const SPAWN_CHUNK_RADIUS = 6 // chunks from player to check for spawning (matches despawn distance)
const CHUNKS_PER_CYCLE = (2 * SPAWN_CHUNK_RADIUS + 1) ** 2 // 169 chunks in 13x13 grid
const SLOT_INTERVAL = SPAWN_CHECK_INTERVAL / CHUNKS_PER_CYCLE // ~0.12s per chunk
const MIN_SPAWN_DISTANCE = 24 // minimum distance from player to spawn
const CHUNK_SIZE = 32 // blocks per chunk
const DEFAULT_MAX_NEARBY = 8 // default max entities of one type nearby
const SPAWN_FEET_CLEARANCE = 0.02 // feet this far above the ground block's top
const SPAWN_FIT_SHIFT = 0.6 // a spawn that only fits further away than this is dropped

/**
 * Entity spawner that spawns entities based on biome configurations.
 * Runs as a LOW priority task and periodically spawns entities around the player.
 */
export class EntitySpawner implements ITask {
  readonly id = 'entity-spawner'
  readonly priority = TaskPriority.LOW
  enabled = true

  private readonly entityManager: EntityManager
  private readonly worldGenerator: WorldGenerator
  private readonly worldManager: WorldManager
  private readonly playerBody: IPhysicsBody

  // Cycle state for staggered spawning
  private cycleTimer = SPAWN_CHECK_INTERVAL // Start at max to trigger first cycle
  private currentSlotIndex = CHUNKS_PER_CYCLE // Start past end to trigger reset
  private cyclePlayerChunkX = 0 // Player chunk X at cycle start
  private cyclePlayerChunkZ = 0 // Player chunk Z at cycle start

  // Pre-allocated chunk offsets for the 9x9 grid around player
  private readonly chunkOffsets: Array<{ dx: number; dz: number }> = []

  private readonly providers: EntitySpawnProvider[] = []

  // Pre-allocated result object
  private readonly taskResult: ITaskResult = {
    completed: true,
    elapsedMs: 0,
    workUnits: 0,
  }

  // Pre-allocated vectors
  private readonly tempPosition = new THREE.Vector3()

  constructor(
    entityManager: EntityManager,
    worldGenerator: WorldGenerator,
    worldManager: WorldManager,
    playerBody: IPhysicsBody
  ) {
    this.entityManager = entityManager
    this.worldGenerator = worldGenerator
    this.worldManager = worldManager
    this.playerBody = playerBody

    // Populate chunk offsets for the 9x9 grid around player
    for (let dx = -SPAWN_CHUNK_RADIUS; dx <= SPAWN_CHUNK_RADIUS; dx++) {
      for (let dz = -SPAWN_CHUNK_RADIUS; dz <= SPAWN_CHUNK_RADIUS; dz++) {
        this.chunkOffsets.push({ dx, dz })
      }
    }
  }

  /** Add a source of extra spawn configs per biome (see EntitySpawnProvider). */
  addSpawnProvider(provider: EntitySpawnProvider): void {
    this.providers.push(provider)
  }

  execute(deltaTime: number, _remainingBudgetMs: number): ITaskResult {
    const startTime = performance.now()

    this.cycleTimer += deltaTime

    // Check if we need to start a new cycle
    if (this.currentSlotIndex >= CHUNKS_PER_CYCLE) {
      this.startNewCycle()
    }

    // Calculate which time slot we should be at based on elapsed time
    const targetSlot = Math.min(
      Math.floor(this.cycleTimer / SLOT_INTERVAL),
      CHUNKS_PER_CYCLE
    )

    // Process all slots from currentSlotIndex to targetSlot (handles frame drops)
    let spawnsAttempted = 0
    while (this.currentSlotIndex < targetSlot) {
      spawnsAttempted += this.evaluateChunkAtSlot(this.currentSlotIndex)
      this.currentSlotIndex++
    }

    this.taskResult.workUnits = spawnsAttempted
    this.taskResult.elapsedMs = performance.now() - startTime
    return this.taskResult
  }

  /**
   * Start a new spawn cycle by snapshotting player position.
   */
  private startNewCycle(): void {
    this.cycleTimer = 0
    this.currentSlotIndex = 0

    // Snapshot player chunk position for this cycle
    const playerPos = this.playerBody.position
    this.cyclePlayerChunkX = Math.floor(playerPos.x / CHUNK_SIZE)
    this.cyclePlayerChunkZ = Math.floor(playerPos.z / CHUNK_SIZE)
  }

  /**
   * Evaluate spawning for a single chunk at the given slot index.
   * Returns the number of spawn attempts made.
   */
  private evaluateChunkAtSlot(slotIndex: number): number {
    const offset = this.chunkOffsets[slotIndex]
    const chunkX = this.cyclePlayerChunkX + offset.dx
    const chunkZ = this.cyclePlayerChunkZ + offset.dz

    // Get spawn configs for biome at player's Y level
    const worldX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2
    const worldZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
    const worldY = this.playerBody.position.y
    const spawnConfigs = this.worldGenerator.getEntitySpawnsAtPosition(worldX, worldZ, worldY)

    // Try to spawn entities based on configs
    let spawnsAttempted = 0
    if (spawnConfigs) {
      for (const config of spawnConfigs) {
        if (this.trySpawnEntity(config, chunkX, chunkZ)) {
          spawnsAttempted++
        }
      }
    }
    if (this.providers.length > 0) {
      const { biome, layer } = this.worldGenerator.getBiomeAtPosition(worldX, worldZ, worldY)
      for (const provider of this.providers) {
        const extra = provider(biome, layer, { x: worldX, y: worldY, z: worldZ })
        if (!extra) continue
        for (const config of extra) {
          if (this.trySpawnEntity(config, chunkX, chunkZ)) {
            spawnsAttempted++
          }
        }
      }
    }

    return spawnsAttempted
  }

  /**
   * Try to spawn an entity based on the spawn config.
   */
  private trySpawnEntity(config: EntitySpawnConfig, chunkX: number, chunkZ: number): boolean {
    // Out of reach: the chunk's nearest point is beyond the config's spawn distance
    if (config.maxSpawnDistance !== undefined) {
      const playerPos = this.playerBody.position
      const nearX = Math.max(chunkX * CHUNK_SIZE, Math.min(playerPos.x, (chunkX + 1) * CHUNK_SIZE))
      const nearZ = Math.max(chunkZ * CHUNK_SIZE, Math.min(playerPos.z, (chunkZ + 1) * CHUNK_SIZE))
      if ((nearX - playerPos.x) ** 2 + (nearZ - playerPos.z) ** 2 > config.maxSpawnDistance ** 2) return false
    }

    // Roll for spawn chance
    if (Math.random() > config.spawnRate) {
      return false
    }

    if (config.condition && !config.condition()) {
      return false
    }

    // Check max nearby limit
    const maxNearby = config.maxNearby ?? DEFAULT_MAX_NEARBY
    const nearbyOfType = this.entityManager.getEntitiesByType(config.entityType)
    if (nearbyOfType.length >= maxNearby) {
      return false
    }

    // Find a valid spawn position within the chunk
    const spawnPos = this.findSpawnPosition(chunkX, chunkZ, config)
    if (!spawnPos) {
      return false
    }

    // Check distance from player
    const playerPos = this.playerBody.position
    const distSq =
      (spawnPos.x - playerPos.x) ** 2 +
      (spawnPos.z - playerPos.z) ** 2
    if (distSq < MIN_SPAWN_DISTANCE ** 2) {
      return false
    }
    if (config.maxSpawnDistance !== undefined && distSq > config.maxSpawnDistance ** 2) {
      return false
    }

    // Create and add entity - only where its whole body fits: a mob that
    // starts inside a block can't move (a cow is 2.2 blocks long)
    const entity = config.createEntity(spawnPos)
    if (!this.entityManager.fitEntity(entity, SPAWN_FIT_SHIFT)) {
      entity.dispose()
      return false
    }
    this.entityManager.addEntity(entity)

    return true
  }

  /**
   * Find a valid spawn position within a chunk.
   * Uses player's Y position to find ground level, which correctly handles
   * underground biomes where getHighestBlockAt would return the ceiling.
   */
  private findSpawnPosition(
    chunkX: number,
    chunkZ: number,
    config: EntitySpawnConfig
  ): THREE.Vector3 | null {
    // Try a few random positions within the chunk
    const attempts = 5
    const playerY = this.playerBody.position.y

    for (let i = 0; i < attempts; i++) {
      // Cell centre: the body is checked against the blocks around it
      const worldX = chunkX * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE) + 0.5
      const worldZ = chunkZ * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE) + 0.5

      // Player-relative search finds cavern floors in underground biomes but
      // cannot see surfaces above the player's feet; searchFromSky configs
      // (surface creatures on raised structures, e.g. bears on den mounds)
      // scan down through the tree canopy instead.
      const foundY = config.searchFromSky
        ? this.findSurfaceGroundY(Math.floor(worldX), Math.floor(worldZ))
        : this.worldManager.getGroundNearY(
            BigInt(Math.floor(worldX)),
            BigInt(Math.floor(worldZ)),
            Math.floor(playerY)
          )

      if (foundY === null) continue
      // Stand on the solid block under any grass, flowers or snow cover
      const groundY = this.solidGroundBelow(worldX, Number(foundY), worldZ)
      if (groundY === null) continue

      // Feet just above the ground; the entity is fitted to the blocks around
      // it before it enters the world (slabs, steps, overhangs)
      const spawnY = groundY + 1 + SPAWN_FEET_CLEARANCE

      // Check Y range constraints
      const minY = config.minY ?? 0
      const maxY = config.maxY ?? 1024
      if (spawnY < minY || spawnY > maxY) continue

      // Check ground block constraint if specified (e.g. beach creatures on sand)
      if (config.validGroundBlocks !== undefined) {
        const groundBlockId = this.worldManager.getBlockIdFast(worldX, groundY, worldZ)
        if (!config.validGroundBlocks.includes(groundBlockId)) continue
      }

      // Check maximum light level constraint if specified (for cave creatures)
      if (config.maxLightLevel !== undefined) {
        const lightLevel = this.worldManager.getLightLevelAtWorld(worldX, spawnY, worldZ)
        if (lightLevel > config.maxLightLevel) continue
      }

      // Check minimum light level constraint if specified (for surface creatures)
      if (config.minLightLevel !== undefined) {
        const lightLevel = this.worldManager.getLightLevelAtWorld(worldX, spawnY, worldZ)
        if (lightLevel < config.minLightLevel) continue
      }

      // Sky and block light apart (night creatures: under the sky, away from torches)
      if (config.minSkyLight !== undefined || config.maxBlockLight !== undefined) {
        const packed = this.worldManager.getPackedLightFast(worldX, spawnY, worldZ)
        if (config.minSkyLight !== undefined && packed >> 4 < config.minSkyLight) continue
        if (config.maxBlockLight !== undefined && (packed & 15) > config.maxBlockLight) continue
      }

      if (config.veto?.(worldX, spawnY, worldZ)) continue

      // Valid position found
      this.tempPosition.set(worldX, spawnY, worldZ)
      return this.tempPosition.clone()
    }

    return null
  }

  /** The first solid block at or up to 3 below y (plants and cover are not ground), or null. */
  private solidGroundBelow(worldX: number, y: number, worldZ: number): number | null {
    for (let groundY = y; groundY >= y - 3; groundY--) {
      if (this.worldManager.getBlockFast(worldX, groundY, worldZ).properties.isSolid) return groundY
    }
    return null
  }

  /**
   * Sky-down surface ground search that sees THROUGH tree canopies: air,
   * non-solid decorations, and leaf-tagged blocks are all skipped, so a
   * den mound under a dense pine canopy is still found. Returns the ground
   * Y, or null when the column is unloaded / has no valid surface.
   */
  private findSurfaceGroundY(worldX: number, worldZ: number): bigint | null {
    // Surface terrain tops out well below 320 (peaks ~284 + trees)
    for (let y = 320; y >= 128; y--) {
      const blockId = this.worldManager.getBlockIdFast(worldX, y, worldZ)
      if (blockId === 0) continue
      const block = this.worldManager.getBlockFast(worldX, y, worldZ)
      if (!block.properties.isSolid) continue
      if (block.properties.tags.includes(BlockTags.LEAVES)) continue
      return BigInt(y)
    }
    return null
  }

  /**
   * Reset spawn cycle to trigger a new cycle on next update.
   */
  clear(): void {
    this.cycleTimer = SPAWN_CHECK_INTERVAL
    this.currentSlotIndex = CHUNKS_PER_CYCLE
  }
}
