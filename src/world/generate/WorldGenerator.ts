import type { WorldManager } from '../WorldManager.ts'
import type { ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createSubChunkKey, type SubChunkKey } from '../interfaces/ICoordinates.ts'
import { worldToChunk } from '../coordinates/CoordinateUtils.ts'
import { SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import { GenerationConfig, type IGenerationConfig } from './GenerationConfig.ts'
import { BiomeGenerator } from './BiomeGenerator.ts'
import { PlainsGenerator } from './biomes/PlainsGenerator.ts'
import { GrassyHillsGenerator } from './biomes/GrassyHillsGenerator.ts'
import { CliffFeature } from './features/CliffFeature.ts'
import type { WorkerBiomeConfig, FeatureConfig } from '../../workers/ChunkGenerationWorker.ts'

interface QueuedSubChunk {
  coordinate: ISubChunkCoordinate
  priority: number
}

/**
 * Coordinates world generation:
 * - Maintains chunk generation queue sorted by distance to player
 * - Generates chunks asynchronously in the background
 * - Uses web workers for heavy terrain/caves/lighting generation
 * - Unloads chunks beyond the unload distance
 */
export class WorldGenerator {
  private readonly world: WorldManager
  private readonly config: GenerationConfig
  private readonly generator: BiomeGenerator
  private readonly workerBiomeConfig: WorkerBiomeConfig

  // Sub-chunk queue for 3D generation
  private readonly subChunkQueue: QueuedSubChunk[] = []
  private readonly generatingSubChunks: Set<SubChunkKey> = new Set()
  private readonly generatedSubChunks: Set<SubChunkKey> = new Set()

  private readonly subChunksPerFrame: number = 2
  private playerChunkX: bigint = 0n
  private playerChunkZ: bigint = 0n
  private playerSubY: number = 0 // Player's sub-chunk Y index (0-15)
  private playerWorldY: number = 0 // Player's world Y position
  private initialized: boolean = false

  constructor(world: WorldManager, config?: Partial<IGenerationConfig>) {
    this.world = world
    this.config = new GenerationConfig(config)
    this.generator = this.createGenerator()
    this.workerBiomeConfig = this.createWorkerBiomeConfig()
  }

  private createGenerator(): BiomeGenerator {
    switch (this.config.biome) {
      case 'plains':
        return new PlainsGenerator(this.config)
      case 'grassy-hills':
        return new GrassyHillsGenerator(this.config)
    }
  }

  /**
   * Convert BiomeProperties to a plain object for worker communication.
   * Extracts feature settings from Feature class instances.
   */
  private createWorkerBiomeConfig(): WorkerBiomeConfig {
    const props = this.generator.getBiomeProperties()

    // Convert Feature instances to serializable configs
    const features: FeatureConfig[] = props.features.map(feature => {
      if (feature instanceof CliffFeature) {
        return { type: 'cliff', settings: feature.settings }
      }
      throw new Error(`Unknown feature type: ${feature.constructor.name}`)
    })

    return {
      name: props.name,
      surfaceBlock: props.surfaceBlock,
      subsurfaceBlock: props.subsurfaceBlock,
      subsurfaceDepth: props.subsurfaceDepth,
      baseBlock: props.baseBlock,
      heightAmplitude: props.heightAmplitude,
      heightOffset: props.heightOffset,
      treeDensity: props.treeDensity,
      features,
      caves: props.caves,
    }
  }

  /**
   * Update generation based on player position.
   * Call once per frame from game loop.
   *
   * @param playerX - Player world X position
   * @param playerZ - Player world Z position
   * @param playerY - Player world Y position
   */
  update(playerX: number, playerZ: number, playerY: number = 0): void {
    // Convert to chunk coordinates
    const playerChunk = worldToChunk({
      x: BigInt(Math.floor(playerX)),
      y: 0n,
      z: BigInt(Math.floor(playerZ)),
    })

    // Calculate player's sub-chunk Y index
    const newPlayerSubY = Math.floor(Math.max(0, playerY) / SUB_CHUNK_HEIGHT)
    const clampedPlayerSubY = Math.min(newPlayerSubY, SUB_CHUNK_COUNT - 1)

    const chunkChanged =
      playerChunk.x !== this.playerChunkX ||
      playerChunk.z !== this.playerChunkZ

    const subYChanged = clampedPlayerSubY !== this.playerSubY

    this.playerChunkX = playerChunk.x
    this.playerChunkZ = playerChunk.z
    this.playerSubY = clampedPlayerSubY
    this.playerWorldY = playerY

    // Update queue on first call or when player moves to new chunk/sub-chunk
    if (!this.initialized || chunkChanged || subYChanged) {
      this.initialized = true
      this.updateSubChunkQueue()
      this.unloadDistantChunks()
    }

    // Process sub-chunk generation queue
    this.processSubChunkQueue()
  }

  /**
   * Force a refresh of chunk loading based on current config.
   * Call this after changing chunkDistance to apply changes immediately.
   */
  refreshChunks(): void {
    if (!this.initialized) return
    this.updateSubChunkQueue()
    this.unloadDistantChunks()
  }

  /**
   * Generate spiral coordinates from center outward.
   * Yields {dx, dz, distance} for each position.
   */
  private *spiralCoordinates(
    radius: number
  ): Generator<{ dx: number; dz: number; distance: number }> {
    // Start at center
    yield { dx: 0, dz: 0, distance: 0 }

    // Spiral outward
    for (let r = 1; r <= radius; r++) {
      // Top edge (left to right)
      for (let dx = -r; dx <= r; dx++) {
        yield { dx, dz: -r, distance: r }
      }
      // Right edge (top to bottom, excluding corners)
      for (let dz = -r + 1; dz <= r - 1; dz++) {
        yield { dx: r, dz, distance: r }
      }
      // Bottom edge (right to left)
      for (let dx = r; dx >= -r; dx--) {
        yield { dx, dz: r, distance: r }
      }
      // Left edge (bottom to top, excluding corners)
      for (let dz = r - 1; dz >= -r + 1; dz--) {
        yield { dx: -r, dz, distance: r }
      }
    }
  }

  /**
   * Unload columns beyond the unload distance.
   * Removes all sub-chunks in the column.
   */
  private unloadDistantChunks(): void {
    const unloadDistance = this.config.getUnloadDistance()
    const unloadDistanceBig = BigInt(unloadDistance)

    const loadedChunks = this.world.getLoadedChunks()

    for (const chunk of loadedChunks) {
      const dx = chunk.coordinate.x - this.playerChunkX
      const dz = chunk.coordinate.z - this.playerChunkZ

      // Use Chebyshev distance (max of abs values)
      const absDx = dx < 0n ? -dx : dx
      const absDz = dz < 0n ? -dz : dz
      const maxDist = absDx > absDz ? absDx : absDz

      if (maxDist > unloadDistanceBig) {
        this.world.unloadChunk(chunk.coordinate)

        // Clear all sub-chunk keys for this column
        for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
          const subKey = createSubChunkKey(chunk.coordinate.x, chunk.coordinate.z, subY)
          this.generatedSubChunks.delete(subKey)
          this.generatingSubChunks.delete(subKey)
        }
      }
    }
  }

  /**
   * Get current configuration.
   */
  getConfig(): GenerationConfig {
    return this.config
  }

  /**
   * Force regeneration of all sub-chunks (e.g., after seed change).
   */
  reset(): void {
    this.subChunkQueue.length = 0
    this.generatingSubChunks.clear()
    this.generatedSubChunks.clear()
    this.initialized = false
  }

  /**
   * Get the number of sub-chunks waiting to be generated.
   */
  getQueuedCount(): number {
    return this.subChunkQueue.length
  }

  /**
   * Get the number of sub-chunks currently generating.
   */
  getGeneratingCount(): number {
    return this.generatingSubChunks.size
  }

  /**
   * Get the number of sub-chunks that have been generated.
   */
  getGeneratedCount(): number {
    return this.generatedSubChunks.size
  }

  /**
   * Calculate 3D priority for a sub-chunk based on distance from player.
   * Prioritizes sub-chunks near the player's Y position.
   */
  private calculateSubChunkPriority(subCoord: ISubChunkCoordinate): number {
    const dx = Number(subCoord.x - this.playerChunkX)
    const dz = Number(subCoord.z - this.playerChunkZ)
    const dy = subCoord.subY - this.playerSubY

    // Weight Y distance slightly more for immediate visibility
    // This ensures sub-chunks at the player's eye level load first
    return Math.sqrt(dx * dx + dz * dz + dy * dy * 1.5)
  }

  /**
   * Rebuild the sub-chunk queue based on current player position.
   * Uses 3D distance for priority ordering.
   */
  private updateSubChunkQueue(): void {
    this.subChunkQueue.length = 0

    const distance = this.config.chunkDistance
    const centerX = this.playerChunkX
    const centerZ = this.playerChunkZ

    // Generate sub-chunks in all columns within distance
    for (const coord of this.spiralCoordinates(distance)) {
      const chunkX = centerX + BigInt(coord.dx)
      const chunkZ = centerZ + BigInt(coord.dz)

      // For each column, queue all sub-chunks
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const subCoord: ISubChunkCoordinate = {
          x: chunkX,
          z: chunkZ,
          subY,
        }

        const key = createSubChunkKey(chunkX, chunkZ, subY)

        // Skip already generated or in-progress sub-chunks
        if (this.generatedSubChunks.has(key) || this.generatingSubChunks.has(key)) {
          continue
        }

        const priority = this.calculateSubChunkPriority(subCoord)

        this.subChunkQueue.push({
          coordinate: subCoord,
          priority,
        })
      }
    }

    // Sort by priority (closest first)
    this.subChunkQueue.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Process queued sub-chunks (generate N per frame).
   */
  private processSubChunkQueue(): void {
    let started = 0

    while (started < this.subChunksPerFrame && this.subChunkQueue.length > 0) {
      const queued = this.subChunkQueue.shift()
      if (!queued) break

      const key = createSubChunkKey(
        queued.coordinate.x,
        queued.coordinate.z,
        queued.coordinate.subY
      )

      // Double-check not already generating
      if (this.generatingSubChunks.has(key)) continue

      this.generatingSubChunks.add(key)

      // Start async generation (fire-and-forget)
      this.generateSubChunk(queued.coordinate, key)
      started++
    }
  }

  /**
   * Generate a single sub-chunk using worker for heavy computation.
   */
  private async generateSubChunk(
    coordinate: ISubChunkCoordinate,
    key: SubChunkKey
  ): Promise<void> {
    try {
      const minWorldY = coordinate.subY * SUB_CHUNK_HEIGHT
      const maxWorldY = minWorldY + SUB_CHUNK_HEIGHT - 1

      // Generate in worker
      const workerResult = await this.world.generateSubChunkInWorker(
        coordinate,
        this.config.seed,
        this.config.seaLevel,
        minWorldY,
        maxWorldY,
        this.workerBiomeConfig
      )

      // Apply results to the sub-chunk
      await this.world.applySubChunkData(
        coordinate,
        workerResult.blocks,
        workerResult.lightData
      )

      this.generatedSubChunks.add(key)
    } catch (error) {
      console.error(`Failed to generate sub-chunk ${key}:`, error)
    } finally {
      this.generatingSubChunks.delete(key)
    }
  }

}
