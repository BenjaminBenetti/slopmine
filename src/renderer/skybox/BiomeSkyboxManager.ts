import type { Skybox } from './Skybox.ts'
import type { BiomeRegistry } from '../../world/generate/biomes/BiomeRegistry.ts'
import { BIOME_REGION_SIZE } from '../../world/generate/biomes/BiomeRegistry.ts'
import type { GenerationConfig } from '../../world/generate/GenerationConfig.ts'
import { LAYER_BOUNDARY_Y } from '../../world/generate/GenerationConfig.ts'
import type { SkyboxSettings } from '../../world/generate/BiomeGenerator.ts'

/**
 * Default skybox settings when a biome doesn't specify any.
 */
const DEFAULT_SKYBOX: SkyboxSettings = {
  brightness: 1.0,
  tint: { r: 1, g: 1, b: 1 },
}

/**
 * A precomputed sample offset relative to the player, with its constant weight.
 */
interface SampleOffset {
  readonly dx: number
  readonly dz: number
  readonly weight: number
}

/**
 * Manages skybox modifications based on the player's position within biomes.
 * Provides smooth blending when crossing biome boundaries.
 */
export class BiomeSkyboxManager {
  private readonly skybox: Skybox
  private readonly biomeRegistry: BiomeRegistry
  private readonly config: GenerationConfig

  // Cache of biome skybox settings (lazily populated)
  private readonly biomeSkyboxCache: Map<string, SkyboxSettings> = new Map()

  // Chunk size for world-to-chunk coordinate conversion
  private readonly CHUNK_SIZE = 32

  // Sample offsets around the player and their (constant) blend weights,
  // precomputed once since the ring geometry never changes - only the center
  // (player position) moves.
  private readonly sampleOffsets: SampleOffset[]
  private readonly totalWeight: number

  // The blended result is a step function of position that only changes when a
  // sample point crosses a 512-block biome-region boundary, so recompute at
  // most once per this many blocks of player movement (the Skybox already
  // lerps smoothly toward the target, so a coarse cadence is invisible).
  private readonly RECOMPUTE_CELL = 8
  private lastCellX = Number.NaN
  private lastCellZ = Number.NaN
  private lastLayer = -1

  // Reused output tint to avoid per-recompute allocation.
  private readonly blendedTint = { r: 1, g: 1, b: 1 }

  constructor(
    skybox: Skybox,
    biomeRegistry: BiomeRegistry,
    config: GenerationConfig
  ) {
    this.skybox = skybox
    this.biomeRegistry = biomeRegistry
    this.config = config

    this.sampleOffsets = this.buildSampleOffsets()
    let total = 0
    for (const offset of this.sampleOffsets) total += offset.weight
    this.totalWeight = total
  }

  /**
   * Precompute the radial sample offsets (relative to the player) and their
   * distance-based blend weights. Both are constant for the life of the manager.
   */
  private buildSampleOffsets(): SampleOffset[] {
    const offsets: SampleOffset[] = []

    const push = (dx: number, dz: number): void => {
      const distSq = dx * dx + dz * dz
      // Inverse-square falloff, avoiding division by zero at the player position.
      const weight = 1 / Math.max(1, distSq / 1000)
      offsets.push({ dx, dz, weight })
    }

    // Always include the player's exact position.
    push(0, 0)

    // Concentric rings.
    const rings = [32, 64, 96, 128]
    const anglesPerRing = [4, 8, 8, 8]
    for (let r = 0; r < rings.length; r++) {
      const radius = rings[r]
      const numAngles = anglesPerRing[r]
      for (let a = 0; a < numAngles; a++) {
        const angle = (a / numAngles) * Math.PI * 2
        push(Math.cos(angle) * radius, Math.sin(angle) * radius)
      }
    }

    return offsets
  }

  /**
   * Get skybox settings for a biome type.
   * Caches the result for efficiency.
   */
  private getSkyboxSettingsForBiome(biomeType: string): SkyboxSettings {
    const cached = this.biomeSkyboxCache.get(biomeType)
    if (cached) return cached

    // Get the biome generator to access its properties
    const registration = this.biomeRegistry.get(biomeType as any)
    if (!registration) {
      return DEFAULT_SKYBOX
    }

    // Create a temporary generator to get the biome properties
    const generator = registration.createGenerator(this.config)
    const properties = generator.getBiomeProperties()
    const skyboxSettings = properties.skybox ?? DEFAULT_SKYBOX

    this.biomeSkyboxCache.set(biomeType, skyboxSettings)
    return skyboxSettings
  }

  /**
   * Calculate the blended skybox settings based on player position and push
   * them to the skybox. Writes into the reused blendedTint object.
   */
  private recomputeAndApply(worldX: number, worldZ: number, layer: 0 | 1): void {
    let weightedBrightness = 0
    let weightedTintR = 0
    let weightedTintG = 0
    let weightedTintB = 0

    for (const offset of this.sampleOffsets) {
      const sampleX = worldX + offset.dx
      const sampleZ = worldZ + offset.dz

      // Region coordinates, computed inline to avoid allocating a temporary.
      const chunkX = Math.floor(sampleX / this.CHUNK_SIZE)
      const chunkZ = Math.floor(sampleZ / this.CHUNK_SIZE)
      const regionX = Math.floor(chunkX / BIOME_REGION_SIZE)
      const regionZ = Math.floor(chunkZ / BIOME_REGION_SIZE)

      // Use selectBiomeForLayer to match the terrain generation for this layer.
      const biomeType = this.biomeRegistry.selectBiomeForLayer(
        regionX,
        regionZ,
        this.config.seed,
        layer
      )

      const settings = this.getSkyboxSettingsForBiome(biomeType)
      const weight = offset.weight

      weightedBrightness += (settings.brightness ?? 1.0) * weight
      weightedTintR += (settings.tint?.r ?? 1.0) * weight
      weightedTintG += (settings.tint?.g ?? 1.0) * weight
      weightedTintB += (settings.tint?.b ?? 1.0) * weight
    }

    if (this.totalWeight > 0) {
      const inv = 1 / this.totalWeight
      this.blendedTint.r = weightedTintR * inv
      this.blendedTint.g = weightedTintG * inv
      this.blendedTint.b = weightedTintB * inv
      this.skybox.setBiomeModifiers(weightedBrightness * inv, this.blendedTint)
    } else {
      this.blendedTint.r = 1
      this.blendedTint.g = 1
      this.blendedTint.b = 1
      this.skybox.setBiomeModifiers(1.0, this.blendedTint)
    }
  }

  /**
   * Update the skybox based on player position.
   * Call this each tick with the player's world coordinates. The blend is only
   * recomputed when the player crosses into a new ~8-block cell or changes
   * vertical layer, since the result is otherwise unchanged.
   */
  update(worldX: number, worldY: number, worldZ: number): void {
    // Determine layer based on player height (same boundary as WorldGenerator).
    const layer: 0 | 1 = worldY < LAYER_BOUNDARY_Y ? 0 : 1

    const cellX = Math.floor(worldX / this.RECOMPUTE_CELL)
    const cellZ = Math.floor(worldZ / this.RECOMPUTE_CELL)

    if (cellX === this.lastCellX && cellZ === this.lastCellZ && layer === this.lastLayer) {
      return
    }
    this.lastCellX = cellX
    this.lastCellZ = cellZ
    this.lastLayer = layer

    this.recomputeAndApply(worldX, worldZ, layer)
  }
}
