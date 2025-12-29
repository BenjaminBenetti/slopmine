import type { WorldManager } from '../WorldManager.ts'
import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../interfaces/ICoordinates.ts'
import { worldToChunk } from '../coordinates/CoordinateUtils.ts'
import { GenerationConfig, type IGenerationConfig } from './GenerationConfig.ts'
import { BiomeGenerator } from './BiomeGenerator.ts'
import { PlainsGenerator } from './biomes/PlainsGenerator.ts'
import { GrassyHillsGenerator } from './biomes/GrassyHillsGenerator.ts'

interface QueuedChunk {
  coordinate: IChunkCoordinate
  priority: number
}

/**
 * Coordinates world generation:
 * - Maintains chunk generation queue sorted by distance to player
 * - Generates chunks asynchronously in the background
 * - Unloads chunks beyond the unload distance
 */
export class WorldGenerator {
  private readonly world: WorldManager
  private readonly config: GenerationConfig
  private readonly generator: BiomeGenerator

  private readonly chunkQueue: QueuedChunk[] = []
  private readonly generatingChunks: Set<ChunkKey> = new Set()
  private readonly generatedChunks: Set<ChunkKey> = new Set()

  private readonly chunksPerFrame: number = 1
  private playerChunkX: bigint = 0n
  private playerChunkZ: bigint = 0n
  private initialized: boolean = false

  constructor(world: WorldManager, config?: Partial<IGenerationConfig>) {
    this.world = world
    this.config = new GenerationConfig(config)
    this.generator = this.createGenerator()
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
   * Update generation based on player position.
   * Call once per frame from game loop.
   *
   * @param playerX - Player world X position
   * @param playerZ - Player world Z position
   */
  update(playerX: number, playerZ: number): void {
    // Convert to chunk coordinates
    const playerChunk = worldToChunk({
      x: BigInt(Math.floor(playerX)),
      y: 0n,
      z: BigInt(Math.floor(playerZ)),
    })

    const chunkChanged =
      playerChunk.x !== this.playerChunkX ||
      playerChunk.z !== this.playerChunkZ

    this.playerChunkX = playerChunk.x
    this.playerChunkZ = playerChunk.z

    // Update queue on first call or when player moves to new chunk
    if (!this.initialized || chunkChanged) {
      this.initialized = true
      this.updateQueue()
      this.unloadDistantChunks()
    }

    // Process chunk queue
    this.processQueue()
  }

  /**
   * Rebuild the chunk queue based on current player position.
   * Uses spiral ordering for efficient nearby-first generation.
   */
  private updateQueue(): void {
    this.chunkQueue.length = 0

    const distance = this.config.chunkDistance
    const centerX = this.playerChunkX
    const centerZ = this.playerChunkZ

    // Generate chunks in a spiral pattern from center
    for (const coord of this.spiralCoordinates(distance)) {
      const chunkCoord: IChunkCoordinate = {
        x: centerX + BigInt(coord.dx),
        z: centerZ + BigInt(coord.dz),
      }

      const key = createChunkKey(chunkCoord.x, chunkCoord.z)

      // Skip already generated or in-progress chunks
      if (this.generatedChunks.has(key) || this.generatingChunks.has(key)) {
        continue
      }

      // Skip already loaded chunks (may have been loaded externally)
      if (this.world.hasChunk(chunkCoord)) {
        this.generatedChunks.add(key)
        continue
      }

      this.chunkQueue.push({
        coordinate: chunkCoord,
        priority: coord.distance,
      })
    }

    // Sort by priority (closest first)
    this.chunkQueue.sort((a, b) => a.priority - b.priority)
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
   * Process queued chunks (generate N per frame).
   */
  private processQueue(): void {
    let started = 0

    while (started < this.chunksPerFrame && this.chunkQueue.length > 0) {
      const queued = this.chunkQueue.shift()
      if (!queued) break

      const key = createChunkKey(queued.coordinate.x, queued.coordinate.z)

      // Double-check not already generating
      if (this.generatingChunks.has(key)) continue

      this.generatingChunks.add(key)

      // Start async generation (fire-and-forget)
      this.generateChunk(queued.coordinate, key)
      started++
    }
  }

  /**
   * Generate a single chunk asynchronously.
   */
  private async generateChunk(
    coordinate: IChunkCoordinate,
    key: ChunkKey
  ): Promise<void> {
    try {
      await this.world.generateChunkAsync(coordinate, async (chunk, world) => {
        await this.generator.generate(chunk, world)
      })

      this.generatedChunks.add(key)
    } catch (error) {
      console.error(`Failed to generate chunk ${key}:`, error)
    } finally {
      this.generatingChunks.delete(key)
    }
  }

  /**
   * Unload chunks beyond the unload distance.
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
        const key = createChunkKey(chunk.coordinate.x, chunk.coordinate.z)
        this.world.unloadChunk(chunk.coordinate)
        this.generatedChunks.delete(key)
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
   * Force regeneration of all chunks (e.g., after seed change).
   */
  reset(): void {
    this.chunkQueue.length = 0
    this.generatingChunks.clear()
    this.generatedChunks.clear()
    this.initialized = false
  }

  /**
   * Get the number of chunks waiting to be generated.
   */
  getQueuedCount(): number {
    return this.chunkQueue.length
  }

  /**
   * Get the number of chunks currently generating.
   */
  getGeneratingCount(): number {
    return this.generatingChunks.size
  }

  /**
   * Get the number of chunks that have been generated.
   */
  getGeneratedCount(): number {
    return this.generatedChunks.size
  }
}
