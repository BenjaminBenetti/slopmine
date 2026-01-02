import { TerrainGenerator } from './TerrainGenerator.ts'
import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../WorldManager.ts'
import type { BlockId } from '../interfaces/IBlock.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'
import { localToWorld } from '../coordinates/CoordinateUtils.ts'
import { FrameBudget } from '../../core/FrameBudget.ts'
import { Feature, type FeatureContext } from './features/Feature.ts'
import { CaveCarver } from './caves/CaveCarver.ts'
import { SkylightPropagator } from '../lighting/SkylightPropagator.ts'

/**
 * Configuration for cave generation within a biome.
 */
export interface CaveSettings {
  /** Enable/disable caves for this biome */
  readonly enabled: boolean

  /** Noise scale for spaghetti tunnels (lower = longer tunnels, 0.02 typical) */
  readonly frequency: number
  /** Carving threshold (lower = more caves, 0.02 typical) */
  readonly threshold: number
  /** Minimum Y level where caves can generate */
  readonly minY: number
  /** Maximum Y level where caves can generate */
  readonly maxY: number

  /** Number of distinct cave layers (1-4 typical) */
  readonly layerCount: number
  /** Vertical spacing between layer centers */
  readonly layerSpacing: number
  /** Center Y level for layer distribution */
  readonly layerPeakY: number

  /** Enable large chambers (cheese caves) */
  readonly cheeseEnabled: boolean
  /** Noise scale for chambers (lower = larger chambers, 0.008 typical) */
  readonly cheeseFrequency: number
  /** Threshold for chamber carving (higher = fewer chambers, 0.6 typical) */
  readonly cheeseThreshold: number

  /** Allow natural cave openings at surface */
  readonly entrancesEnabled: boolean
  /** Minimum width of cave entrances in blocks */
  readonly entranceMinWidth: number
}

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
  readonly caves?: CaveSettings
}

/**
 * Abstract biome generator that provides biome-specific terrain generation.
 */
export abstract class BiomeGenerator extends TerrainGenerator {
  protected abstract readonly properties: BiomeProperties
  protected readonly frameBudget = new FrameBudget()
  private caveCarver: CaveCarver | null = null
  private readonly skylightPropagator = new SkylightPropagator()

  /**
   * Get the biome properties for serialization to workers.
   */
  getBiomeProperties(): BiomeProperties {
    return this.properties
  }

  /**
   * Generate decorations only (trees, flowers, etc).
   * Called after worker has generated terrain/caves/lighting/features.
   */
  async generateDecorationsOnly(chunk: IChunkData, world: WorldManager | null): Promise<void> {
    await this.generateDecorations(chunk, world)
  }

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
  protected async generateTerrain(chunk: IChunkData): Promise<void> {
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
  protected async generateFeatures(chunk: IChunkData, world: WorldManager | null): Promise<void> {
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
    chunk: IChunkData,
    world: WorldManager | null
  ): Promise<void> {
    // Default: no decorations - override in subclasses
  }

  /**
   * Generate decorations for a specific sub-chunk.
   * Called from the main thread after worker generation is applied.
   */
  async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    // Default: no-op - override in subclasses
  }

  /**
   * Generate caves by carving air pockets in the terrain.
   */
  protected async generateCaves(chunk: IChunkData): Promise<void> {
    const caves = this.properties.caves
    if (!caves?.enabled) return

    // Lazy initialization of cave carver
    if (!this.caveCarver) {
      this.caveCarver = new CaveCarver(this.config.seed)
    }

    await this.caveCarver.carve(
      chunk,
      caves,
      (worldX, worldZ) => this.getHeightAt(worldX, worldZ),
      this.frameBudget
    )
  }

  /**
   * Main generation method.
   */
  async generate(chunk: IChunkData, world: WorldManager | null): Promise<void> {
    await this.generateTerrain(chunk)
    await this.generateCaves(chunk)
    this.skylightPropagator.propagate(chunk)
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
