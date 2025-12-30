import { TerrainGenerator } from './TerrainGenerator.ts'
import type { Chunk } from '../chunks/Chunk.ts'
import type { WorldManager } from '../WorldManager.ts'
import type { BlockId } from '../interfaces/IBlock.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'
import { localToWorld } from '../coordinates/CoordinateUtils.ts'
import { FrameBudget } from '../../core/FrameBudget.ts'
import { Feature, type FeatureContext } from './features/Feature.ts'

export interface BiomeProperties {
  readonly name: string
  readonly surfaceBlock: BlockId
  readonly subsurfaceBlock: BlockId
  readonly subsurfaceDepth: number
  readonly baseBlock: BlockId
  readonly heightAmplitude: number
  readonly heightOffset: number
  readonly treeDensity: number
  readonly features: Feature[]
}

/**
 * Abstract biome generator that provides biome-specific terrain generation.
 */
export abstract class BiomeGenerator extends TerrainGenerator {
  protected abstract readonly properties: BiomeProperties
  protected readonly frameBudget = new FrameBudget()

  /**
   * Get base terrain height at world coordinates (before features).
   */
  override getHeightAt(worldX: number, worldZ: number): number {
    const baseNoise = this.noise.fractalNoise2D(worldX, worldZ, 4, 0.5, 0.01)

    const { seaLevel } = this.config
    const { heightAmplitude, heightOffset } = this.properties

    const height = seaLevel + heightOffset + baseNoise * heightAmplitude

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

        this.fillColumn(
          chunk,
          localX,
          localZ,
          height,
          surfaceBlock,
          subsurfaceBlock,
          subsurfaceDepth,
          baseBlock
        )
      }
      // Yield when frame budget is exhausted
      await this.frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Apply all features from the biome's feature list.
   */
  protected async generateFeatures(chunk: Chunk, world: WorldManager): Promise<void> {
    const context: FeatureContext = {
      chunk,
      world,
      noise: this.noise,
      config: this.config,
      biomeProperties: this.properties,
      getBaseHeightAt: (worldX, worldZ) => this.getHeightAt(worldX, worldZ),
      frameBudget: this.frameBudget,
    }

    for (const feature of this.properties.features) {
      await feature.scan(context)
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
    await this.generateFeatures(chunk, world)
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
