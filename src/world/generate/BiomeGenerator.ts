import { TerrainGenerator } from './TerrainGenerator.ts'
import type { Chunk } from '../chunks/Chunk.ts'
import type { WorldManager } from '../WorldManager.ts'
import type { BlockId } from '../interfaces/IBlock.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'
import { localToWorld } from '../coordinates/CoordinateUtils.ts'
import { FrameBudget } from '../../core/FrameBudget.ts'

export interface BiomeProperties {
  readonly name: string
  readonly surfaceBlock: BlockId
  readonly subsurfaceBlock: BlockId
  readonly subsurfaceDepth: number
  readonly baseBlock: BlockId
  readonly heightAmplitude: number
  readonly heightOffset: number
  readonly treeDensity: number
  readonly cliffFrequency: number
  readonly cliffThreshold: number
  readonly cliffMaxHeight: number
}

/**
 * Abstract biome generator that provides biome-specific terrain generation.
 */
export abstract class BiomeGenerator extends TerrainGenerator {
  protected abstract readonly properties: BiomeProperties
  protected readonly frameBudget = new FrameBudget()

  /**
   * Get biome-adjusted height at world coordinates.
   */
  override getHeightAt(worldX: number, worldZ: number): number {
    const baseNoise = this.noise.fractalNoise2D(worldX, worldZ, 4, 0.5, 0.01)

    const { seaLevel } = this.config
    const { heightAmplitude, heightOffset, cliffFrequency, cliffThreshold, cliffMaxHeight } =
      this.properties

    let height = seaLevel + heightOffset + baseNoise * heightAmplitude

    // Cliff noise - creates zones with sudden height jumps
    const cliffNoise = this.noise.noise2D(
      worldX * cliffFrequency,
      worldZ * cliffFrequency
    )
    if (cliffNoise > cliffThreshold) {
      const cliffIntensity = (cliffNoise - cliffThreshold) / (1 - cliffThreshold)
      const cliffStep = Math.floor(cliffIntensity * cliffMaxHeight)
      height += cliffStep
    }

    return Math.floor(height)
  }

  /**
   * Generate the base terrain (stone/dirt/grass layers).
   * Yields based on time budget to prevent blocking the main thread.
   */
  protected async generateTerrain(chunk: Chunk): Promise<void> {
    const { surfaceBlock, subsurfaceBlock, subsurfaceDepth, baseBlock } =
      this.properties
    const coord = chunk.coordinate

    this.frameBudget.startFrame()

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const height = this.getHeightAt(worldX, worldZ)

        // Check neighbor heights for cliff detection
        const minNeighborHeight = Math.min(
          this.getHeightAt(worldX - 1, worldZ),
          this.getHeightAt(worldX + 1, worldZ),
          this.getHeightAt(worldX, worldZ - 1),
          this.getHeightAt(worldX, worldZ + 1)
        )

        // If we're 2+ blocks higher than lowest neighbor, we have a cliff face
        const cliffExposure = height - minNeighborHeight

        this.fillColumnWithCliff(
          chunk,
          localX,
          localZ,
          height,
          surfaceBlock,
          subsurfaceBlock,
          subsurfaceDepth,
          baseBlock,
          cliffExposure
        )
      }
      // Yield when frame budget is exhausted
      await this.frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Generate decorations (trees, flowers, etc.). Override in subclasses.
   */
  protected async generateDecorations(
    chunk: Chunk,
    world: WorldManager
  ): Promise<void> {
    // Default: no decorations - override in subclasses
  }

  /**
   * Main generation method.
   */
  async generate(chunk: Chunk, world: WorldManager): Promise<void> {
    await this.generateTerrain(chunk)
    await this.generateDecorations(chunk, world)
  }

  /**
   * Yield to the event loop to prevent blocking.
   * Uses requestAnimationFrame for smooth frame alignment.
   */
  protected yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }
}
