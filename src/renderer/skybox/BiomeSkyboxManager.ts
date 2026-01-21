import type { Skybox } from './Skybox.ts'
import type { BiomeRegistry } from '../../world/generate/biomes/BiomeRegistry.ts'
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

  // How many blocks around the player to sample for biome blending
  private readonly BLEND_RADIUS = 128 // 4 chunk widths

  constructor(
    skybox: Skybox,
    biomeRegistry: BiomeRegistry,
    config: GenerationConfig
  ) {
    this.skybox = skybox
    this.biomeRegistry = biomeRegistry
    this.config = config
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
   * Calculate the blended skybox settings based on player position.
   * Samples biomes at multiple points around the player and blends based on distance.
   */
  private calculateBlendedSettings(
    worldX: number,
    worldY: number,
    worldZ: number
  ): { brightness: number; tint: { r: number; g: number; b: number } } {
    // Sample points in a grid pattern around the player
    const samplePoints = this.getSamplePoints(worldX, worldZ)

    // Accumulate weighted skybox settings
    let totalWeight = 0
    let weightedBrightness = 0
    let weightedTintR = 0
    let weightedTintG = 0
    let weightedTintB = 0
    
    // Determine layer based on player height (using same boundary as WorldGenerator)
    // If player is underground, use underground biomes. If surface, use surface biomes.
    const layer: 0 | 1 = worldY < LAYER_BOUNDARY_Y ? 0 : 1

    for (const point of samplePoints) {
      // Get the biome at this sample point
      const chunkX = Math.floor(point.x / this.CHUNK_SIZE)
      const chunkZ = Math.floor(point.z / this.CHUNK_SIZE)
      const { regionX, regionZ } = this.biomeRegistry.getRegionCoords(chunkX, chunkZ)
      
      // Use selectBiomeForLayer to ensure we get the biome that matches the terrain generation
      // for the current layer (surface or underground)
      const biomeType = this.biomeRegistry.selectBiomeForLayer(
        regionX, 
        regionZ, 
        this.config.seed, 
        layer
      )

      // Get skybox settings for this biome
      const settings = this.getSkyboxSettingsForBiome(biomeType)

      // Calculate distance-based weight (inverse square falloff)
      const dx = point.x - worldX
      const dz = point.z - worldZ
      const distSq = dx * dx + dz * dz
      // Avoid division by zero at player position
      const weight = 1 / Math.max(1, distSq / 1000)

      totalWeight += weight
      weightedBrightness += (settings.brightness ?? 1.0) * weight
      weightedTintR += (settings.tint?.r ?? 1.0) * weight
      weightedTintG += (settings.tint?.g ?? 1.0) * weight
      weightedTintB += (settings.tint?.b ?? 1.0) * weight
    }

    // Normalize by total weight
    if (totalWeight > 0) {
      return {
        brightness: weightedBrightness / totalWeight,
        tint: {
          r: weightedTintR / totalWeight,
          g: weightedTintG / totalWeight,
          b: weightedTintB / totalWeight,
        },
      }
    }

    return { brightness: 1.0, tint: { r: 1, g: 1, b: 1 } }
  }

  /**
   * Generate sample points around the player for biome sampling.
   * Uses a radial pattern for better coverage.
   */
  private getSamplePoints(
    centerX: number,
    centerZ: number
  ): Array<{ x: number; z: number }> {
    const points: Array<{ x: number; z: number }> = []

    // Always include player's exact position
    points.push({ x: centerX, z: centerZ })

    // Sample in concentric rings
    const rings = [32, 64, 96, 128]
    const anglesPerRing = [4, 8, 8, 8]

    for (let r = 0; r < rings.length; r++) {
      const radius = rings[r]
      const numAngles = anglesPerRing[r]

      for (let a = 0; a < numAngles; a++) {
        const angle = (a / numAngles) * Math.PI * 2
        points.push({
          x: centerX + Math.cos(angle) * radius,
          z: centerZ + Math.sin(angle) * radius,
        })
      }
    }

    return points
  }

  /**
   * Update the skybox based on player position.
   * Call this each frame with the player's world coordinates.
   */
  update(worldX: number, worldY: number, worldZ: number): void {
    const blended = this.calculateBlendedSettings(worldX, worldY, worldZ)
    this.skybox.setBiomeModifiers(blended.brightness, blended.tint)
  }
}
