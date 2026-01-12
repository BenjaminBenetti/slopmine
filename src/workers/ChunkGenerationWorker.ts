/**
 * Web Worker for chunk terrain generation.
 * Handles: terrain, caves, initial skylight, features.
 * Does NOT handle: actual tree placement (crosses chunk boundaries).
 *
 * Receives biome config from main thread - no duplicated configuration here.
 */

import { WorkerChunk } from './WorkerChunk.ts'
import { WorkerSubChunk } from './WorkerSubChunk.ts'
import { SimplexNoise } from '../world/generate/SimplexNoise.ts'
import { CaveCarver } from '../world/generate/caves/CaveCarver.ts'
import { SkylightPropagator } from '../world/lighting/SkylightPropagator.ts'
import { CliffFeature, type CliffFeatureSettings } from '../world/generate/features/CliffFeature.ts'
import { OreFeature, type OreFeatureSettings, type OrePosition } from '../world/generate/features/OreFeature.ts'
import { WaterFeature, type WaterEdgeEffects } from '../world/generate/features/WaterFeature.ts'
import { Feature, type FeatureContext } from '../world/generate/features/Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import { localToWorld } from '../world/coordinates/CoordinateUtils.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'
import { evaluateTerrainConfig } from '../world/generate/terrain/NoiseEvaluator.ts'
import type { TerrainConfig } from '../world/generate/terrain/TerrainConfig.ts'
import type { CaveSettings, WaterSettings, BiomeGenerator } from '../world/generate/BiomeGenerator.ts'
import type { IGenerationConfig } from '../world/generate/GenerationConfig.ts'

// Import biome registry for dynamic biome instantiation
import { biomeRegistry } from '../world/generate/biomes/BiomeRegistry.ts'
import type { BiomeType } from '../world/generate/GenerationConfig.ts'

// Initialize block registry in worker context
registerDefaultBlocks()

/**
 * Cache of biome generator instances by seed+name key.
 * Biome generators are created lazily and cached for reuse.
 */
const biomeCache = new Map<string, BiomeGenerator>()

/**
 * Get or create a biome generator instance for the given config.
 * Uses the biome registry to dynamically create generators.
 */
function getBiomeGenerator(name: string, seed: number, seaLevel: number, terrainThickness: number): BiomeGenerator {
  const key = `${seed}-${name}`
  let generator = biomeCache.get(key)

  if (!generator) {
    const config: IGenerationConfig = {
      seed,
      seaLevel,
      terrainThickness,
      chunkDistance: 8,
    }

    // Get biome from registry, fallback to first registered biome if not found
    const registration = biomeRegistry.get(name as BiomeType)
    if (registration) {
      generator = registration.createGenerator(config as any)
    } else {
      const allBiomes = biomeRegistry.getAll()
      generator = allBiomes[0].createGenerator(config as any)
    }

    biomeCache.set(key, generator)
  }

  return generator
}

/**
 * Serialized feature config passed from main thread.
 */
export type FeatureConfig =
  | { type: 'cliff'; settings: CliffFeatureSettings }
  | { type: 'ore'; settings: OreFeatureSettings }
  | { type: 'water'; settings: WaterSettings }

/**
 * Biome config passed from main thread (plain object, no class instances).
 */
export interface WorkerBiomeConfig {
  name: string
  treeDensity: number
  features: FeatureConfig[]
  caves?: CaveSettings
  water?: WaterSettings
  terrainConfig: TerrainConfig
}

/**
 * Biome blend data for smooth transitions between biomes.
 * Contains the primary biome and adjacent biomes for height blending.
 */
export interface BiomeBlendData {
  /** The primary biome for this chunk */
  primary: WorkerBiomeConfig
  /** Adjacent biomes for edge blending (optional, same as primary if not at edge) */
  north?: WorkerBiomeConfig
  south?: WorkerBiomeConfig
  east?: WorkerBiomeConfig
  west?: WorkerBiomeConfig
  /** Diagonal corner biomes for proper corner blending */
  northeast?: WorkerBiomeConfig
  northwest?: WorkerBiomeConfig
  southeast?: WorkerBiomeConfig
  southwest?: WorkerBiomeConfig
  /** Position within the 16x16 chunk biome region (0-15) */
  chunkLocalX: number
  chunkLocalZ: number
}

/**
 * Size of a biome region in blocks (16 chunks × 32 blocks).
 */
const BIOME_REGION_SIZE_BLOCKS = 16 * 32 // 512 blocks

/**
 * Width of blend zone on each side of boundary (96 blocks).
 */
const BLEND_DISTANCE = 96

/**
 * Smoothstep interpolation for smoother blending.
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Get the TerrainConfig from a biome config.
 */
function getTerrainConfig(biomeConfig: WorkerBiomeConfig): TerrainConfig {
  return biomeConfig.terrainConfig
}

/**
 * Calculate distance to the nearest biome boundary for a world coordinate.
 * Returns: { distance, neighborDirection }
 * - distance: blocks to nearest boundary (0 at boundary, up to 256 at center)
 * - neighborDirection: -1 if closer to west/north boundary, 1 if closer to east/south
 */
function getDistanceToBoundary(worldCoord: number): { distance: number; neighborDirection: -1 | 1 } {
  // Get position within region (0 to 511)
  const posInRegion = ((worldCoord % BIOME_REGION_SIZE_BLOCKS) + BIOME_REGION_SIZE_BLOCKS) % BIOME_REGION_SIZE_BLOCKS

  // Distance to west boundary (at 0) and east boundary (at 512)
  const distToWest = posInRegion
  const distToEast = BIOME_REGION_SIZE_BLOCKS - posInRegion

  if (distToWest < distToEast) {
    return { distance: distToWest, neighborDirection: -1 }
  } else {
    return { distance: distToEast, neighborDirection: 1 }
  }
}

/**
 * Get the biome region coordinate for a world position.
 */
function getRegionCoord(worldCoord: number): number {
  return Math.floor(worldCoord / BIOME_REGION_SIZE_BLOCKS)
}

/**
 * Request sent to the chunk generation worker.
 */
export interface ChunkGenerationRequest {
  type: 'generate'
  chunkX: number
  chunkZ: number
  seed: number
  seaLevel: number
  terrainThickness: number
  biomeConfig: WorkerBiomeConfig
  blocks: Uint16Array
  lightData: Uint8Array
}

/**
 * Response from the chunk generation worker.
 */
export interface ChunkGenerationResponse {
  type: 'generate-result'
  chunkX: number
  chunkZ: number
  blocks: Uint16Array
  lightData: Uint8Array
}

/**
 * Error response from worker.
 */
export interface ChunkGenerationError {
  type: 'generate-error'
  chunkX: number
  chunkZ: number
  error: string
}

// ==================== Sub-Chunk Generation Types ====================

/**
 * Request to generate a single sub-chunk (32x32x64).
 */
export interface SubChunkGenerationRequest {
  type: 'generate-subchunk'
  chunkX: number
  chunkZ: number
  subY: number // 0-15 sub-chunk index
  minWorldY: number // subY * 64
  maxWorldY: number // subY * 64 + 63
  seed: number
  seaLevel: number
  terrainThickness: number
  biomeData: BiomeBlendData
  blocks: Uint16Array // 65,536 elements
  lightData: Uint8Array // 65,536 elements
}

/**
 * Response from sub-chunk generation.
 */
export interface SubChunkGenerationResponse {
  type: 'subchunk-result'
  chunkX: number
  chunkZ: number
  subY: number
  blocks: Uint16Array
  lightData: Uint8Array
  hasTerrainAbove: boolean // True if terrain extends above this sub-chunk
  maxSolidY: number // Highest solid block world Y in this sub-chunk (-1 if empty)
  orePositions: OrePosition[] // Debug: positions of all ore blocks placed
  isFullyOpaque: boolean // True if ALL blocks in this sub-chunk are opaque (for occlusion culling)
  waterEdgeEffects?: WaterEdgeEffects // Which edges have water (for neighbor propagation)
}

/**
 * Error response from sub-chunk generation.
 */
export interface SubChunkGenerationError {
  type: 'subchunk-error'
  chunkX: number
  chunkZ: number
  subY: number
  error: string
}

/**
 * Reconstruct Feature instances from serialized configs.
 */
function createFeatures(configs: FeatureConfig[]): Feature[] {
  return configs.map(config => {
    switch (config.type) {
      case 'cliff':
        return new CliffFeature(config.settings)
      case 'ore':
        return new OreFeature(config.settings)
      case 'water':
        return new WaterFeature(config.settings)
      default:
        throw new Error(`Unknown feature type: ${(config as any).type}`)
    }
  })
}

/**
 * Generate terrain height at a world position for a single biome.
 * Uses terrainConfig if available, otherwise falls back to legacy calculation.
 */
function getHeightAt(
  noise: SimplexNoise,
  worldX: number,
  worldZ: number,
  seaLevel: number,
  biomeConfig: WorkerBiomeConfig
): number {
  const config = getTerrainConfig(biomeConfig)
  return Math.floor(evaluateTerrainConfig(noise, config, worldX, worldZ, seaLevel))
}

/**
 * Get the 4 corner biomes for bilinear interpolation based on which corner we're near.
 * Returns [primary corner, X neighbor, Z neighbor, diagonal corner]
 */
function getCornerBiomes(
  biomeData: BiomeBlendData,
  xDir: -1 | 1,
  zDir: -1 | 1
): [WorkerBiomeConfig, WorkerBiomeConfig, WorkerBiomeConfig, WorkerBiomeConfig] {
  const { primary } = biomeData

  // Get the 4 biomes based on which corner we're near
  // xDir: -1 = west, 1 = east
  // zDir: -1 = north, 1 = south
  const xNeighbor = xDir === -1 ? (biomeData.west ?? primary) : (biomeData.east ?? primary)
  const zNeighbor = zDir === -1 ? (biomeData.north ?? primary) : (biomeData.south ?? primary)

  // Get the diagonal corner biome
  let cornerNeighbor: WorkerBiomeConfig
  if (xDir === 1 && zDir === -1) {
    cornerNeighbor = biomeData.northeast ?? primary
  } else if (xDir === -1 && zDir === -1) {
    cornerNeighbor = biomeData.northwest ?? primary
  } else if (xDir === 1 && zDir === 1) {
    cornerNeighbor = biomeData.southeast ?? primary
  } else {
    cornerNeighbor = biomeData.southwest ?? primary
  }

  return [primary, xNeighbor, zNeighbor, cornerNeighbor]
}

/**
 * Bilinear interpolation between 4 values.
 * u: blend factor along X (0 = left, 1 = right)
 * v: blend factor along Z (0 = top, 1 = bottom)
 * Values: [topLeft, topRight, bottomLeft, bottomRight]
 */
function bilerp(values: [number, number, number, number], u: number, v: number): number {
  const [tl, tr, bl, br] = values
  const top = lerp(tl, tr, u)
  const bottom = lerp(bl, br, u)
  return lerp(top, bottom, v)
}

/**
 * Generate blended terrain height at a world position.
 * Uses NOISE-LEVEL BLENDING: evaluates each biome's terrain config separately,
 * then blends the resulting HEIGHT VALUES. This allows biomes with completely
 * different noise types to blend smoothly.
 */
function getBlendedHeightAt(
  noise: SimplexNoise,
  worldX: number,
  worldZ: number,
  seaLevel: number,
  biomeData: BiomeBlendData
): number {
  const { primary } = biomeData
  const primaryConfig = getTerrainConfig(primary)

  // Calculate distance to nearest boundary for each axis
  const xBoundary = getDistanceToBoundary(worldX)
  const zBoundary = getDistanceToBoundary(worldZ)

  const xInBlend = xBoundary.distance < BLEND_DISTANCE
  const zInBlend = zBoundary.distance < BLEND_DISTANCE

  // Evaluate primary biome's height
  const primaryHeight = evaluateTerrainConfig(noise, primaryConfig, worldX, worldZ, seaLevel)

  if (!xInBlend && !zInBlend) {
    // No blending needed - use primary biome only
    return Math.floor(primaryHeight)
  }

  // NOISE-LEVEL BLENDING: Evaluate each biome separately, then blend heights

  if (xInBlend && zInBlend) {
    // Corner case: bilinear interpolation of 4 biome heights
    const [b00, b10, b01, b11] = getCornerBiomes(
      biomeData,
      xBoundary.neighborDirection,
      zBoundary.neighborDirection
    )

    // Evaluate all 4 corner biomes at this position
    const h00 = evaluateTerrainConfig(noise, getTerrainConfig(b00), worldX, worldZ, seaLevel)
    const h10 = evaluateTerrainConfig(noise, getTerrainConfig(b10), worldX, worldZ, seaLevel)
    const h01 = evaluateTerrainConfig(noise, getTerrainConfig(b01), worldX, worldZ, seaLevel)
    const h11 = evaluateTerrainConfig(noise, getTerrainConfig(b11), worldX, worldZ, seaLevel)

    // Blend factors: 0.5 at boundary, 0 at edge of blend zone
    const u = 0.5 * (1 - smoothstep(xBoundary.distance / BLEND_DISTANCE))
    const v = 0.5 * (1 - smoothstep(zBoundary.distance / BLEND_DISTANCE))

    // Bilinear interpolation of heights
    return Math.floor(bilerp([h00, h10, h01, h11], u, v))

  } else if (xInBlend) {
    // X-axis blending only
    const neighbor = xBoundary.neighborDirection === -1
      ? (biomeData.west ?? primary)
      : (biomeData.east ?? primary)
    const neighborHeight = evaluateTerrainConfig(
      noise, getTerrainConfig(neighbor), worldX, worldZ, seaLevel
    )
    // t: 0.5 at boundary, 1.0 at edge of blend zone (fully primary)
    const t = 0.5 + 0.5 * smoothstep(xBoundary.distance / BLEND_DISTANCE)
    return Math.floor(lerp(neighborHeight, primaryHeight, t))

  } else {
    // Z-axis blending only
    const neighbor = zBoundary.neighborDirection === -1
      ? (biomeData.north ?? primary)
      : (biomeData.south ?? primary)
    const neighborHeight = evaluateTerrainConfig(
      noise, getTerrainConfig(neighbor), worldX, worldZ, seaLevel
    )
    const t = 0.5 + 0.5 * smoothstep(zBoundary.distance / BLEND_DISTANCE)
    return Math.floor(lerp(neighborHeight, primaryHeight, t))
  }
}

/**
 * Generate terrain for the chunk using the biome's fillChunk method.
 */
function generateTerrain(
  chunk: WorkerChunk,
  noise: SimplexNoise,
  seed: number,
  seaLevel: number,
  terrainThickness: number,
  biomeConfig: WorkerBiomeConfig
): void {
  const biome = getBiomeGenerator(biomeConfig.name, seed, seaLevel, terrainThickness)
  const maxY = seaLevel + 100 // Allow for terrain above sea level

  // Height getter that uses the biome's terrain config
  const getHeight = (worldX: number, worldZ: number) =>
    getHeightAt(noise, worldX, worldZ, seaLevel, biomeConfig)

  // For full chunks, minY=0 means no Y offset (world Y = local Y)
  ;(biome as any).fillChunk(chunk, 0, maxY, noise, getHeight)
}

/**
 * Main chunk generation function.
 */
async function generateChunk(request: ChunkGenerationRequest): Promise<ChunkGenerationResponse> {
  const { chunkX, chunkZ, seed, seaLevel, terrainThickness, biomeConfig, blocks, lightData } = request

  // Create WorkerChunk with the provided buffers
  const chunk = new WorkerChunk(chunkX, chunkZ, blocks, lightData)

  // Create noise generator
  const noise = new SimplexNoise(seed)

  // Create height getter for caves and features
  const getHeight = (worldX: number, worldZ: number) =>
    getHeightAt(noise, worldX, worldZ, seaLevel, biomeConfig)

  // Phase 1: Generate terrain using biome's fillColumn
  generateTerrain(chunk, noise, seed, seaLevel, terrainThickness, biomeConfig)

  // Phase 2: Carve caves
  const caves = biomeConfig.caves
  if (caves?.enabled) {
    const caveCarver = new CaveCarver(seed)
    await caveCarver.carve(chunk, caves, getHeight)
  }

  // Phase 3: Apply features
  const features = createFeatures(biomeConfig.features)
  if (features.length > 0) {
    const workerConfig: IGenerationConfig = {
      seed,
      seaLevel,
      terrainThickness,
      chunkDistance: 4,
    }

    // Create a minimal biome properties object for feature context
    const biomeProperties = {
      ...biomeConfig,
      frequency: 1.0, // Not used in worker context
      features, // Now contains actual Feature instances
    }

    const featureContext: FeatureContext = {
      chunk,
      world: null,
      noise,
      config: workerConfig,
      biomeProperties,
      getBaseHeightAt: getHeight,
      frameBudget: undefined,
    }

    for (const feature of features) {
      await feature.scan(featureContext)
    }
  }

  // Phase 4: Calculate initial skylight (internal only)
  const skylightPropagator = new SkylightPropagator()
  skylightPropagator.propagate(chunk)

  return {
    type: 'generate-result',
    chunkX,
    chunkZ,
    blocks: chunk.getBlockData(),
    lightData: chunk.getLightData(),
  }
}

// ==================== Sub-Chunk Generation ====================

/**
 * Generate terrain for a sub-chunk with biome blending.
 * Uses fillChunk with Y bounds for efficient generation.
 */
function generateSubChunkTerrain(
  subChunk: WorkerSubChunk,
  noise: SimplexNoise,
  seed: number,
  seaLevel: number,
  terrainThickness: number,
  minWorldY: number,
  maxWorldY: number,
  biomeData: BiomeBlendData
): { hasTerrainAbove: boolean; maxSolidY: number } {
  // Get biome generator instance (uses primary biome for block types)
  const biome = getBiomeGenerator(biomeData.primary.name, seed, seaLevel, terrainThickness)

  // Height getter with biome blending
  const getHeight = (worldX: number, worldZ: number) =>
    getBlendedHeightAt(noise, worldX, worldZ, seaLevel, biomeData)

  // Call the biome's fillChunk with sub-chunk's Y bounds
  ;(biome as any).fillChunk(subChunk, minWorldY, maxWorldY, noise, getHeight)

  // Calculate hasTerrainAbove and maxSolidY by scanning the sub-chunk
  let hasTerrainAbove = false
  let maxSolidY = -1

  for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      // Check if terrain extends above this sub-chunk
      const worldCoord = localToWorld(
        { x: subChunk.coordinate.x, z: subChunk.coordinate.z },
        { x: localX, y: 0, z: localZ }
      )
      const height = getHeight(Number(worldCoord.x), Number(worldCoord.z))
      if (height > maxWorldY) {
        hasTerrainAbove = true
      }

      // Find max solid Y in this column
      for (let localY = SUB_CHUNK_HEIGHT - 1; localY >= 0; localY--) {
        if (subChunk.getBlockId(localX, localY, localZ) !== 0) {
          const worldY = minWorldY + localY
          if (worldY > maxSolidY) {
            maxSolidY = worldY
          }
          break
        }
      }
    }
  }

  return { hasTerrainAbove, maxSolidY }
}

/**
 * Apply provisional skylight to a sub-chunk.
 * Full skylight if above terrain, otherwise needs cross-chunk propagation later.
 */
function applyProvisionalSkylight(
  subChunk: WorkerSubChunk,
  noise: SimplexNoise,
  seaLevel: number,
  minWorldY: number,
  maxWorldY: number,
  biomeData: BiomeBlendData
): void {
  const coord = subChunk.coordinate

  for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      const worldCoord = localToWorld(
        { x: coord.x, z: coord.z },
        { x: localX, y: 0, z: localZ }
      )
      const worldX = Number(worldCoord.x)
      const worldZ = Number(worldCoord.z)

      // Use blended height for consistent skylight with terrain
      const terrainHeight = getBlendedHeightAt(noise, worldX, worldZ, seaLevel, biomeData)

      // Apply skylight to blocks above terrain within this sub-chunk
      for (let worldY = maxWorldY; worldY >= minWorldY; worldY--) {
        const localY = worldY - minWorldY
        const blockId = subChunk.getBlockId(localX, localY, localZ)

        if (blockId === 0) {
          // Air block
          if (worldY > terrainHeight) {
            // Above terrain - full skylight
            subChunk.setSkylight(localX, localY, localZ, 15)
          } else {
            // Below terrain (cave) - no skylight for now
            subChunk.setSkylight(localX, localY, localZ, 0)
          }
        } else {
          // Solid block - no skylight
          subChunk.setSkylight(localX, localY, localZ, 0)
        }
      }
    }
  }
}

/**
 * Generate a single sub-chunk.
 */
async function generateSubChunk(request: SubChunkGenerationRequest): Promise<SubChunkGenerationResponse> {
  const { chunkX, chunkZ, subY, minWorldY, maxWorldY, seed, seaLevel, terrainThickness, biomeData, blocks, lightData } = request
  const biomeConfig = biomeData.primary

  // Create WorkerSubChunk with the provided buffers
  const subChunk = new WorkerSubChunk(chunkX, chunkZ, subY, blocks, lightData)

  // Create noise generator
  const noise = new SimplexNoise(seed)

  // Create height getter for caves (uses blended height for consistency)
  const getHeight = (worldX: number, worldZ: number) =>
    getBlendedHeightAt(noise, worldX, worldZ, seaLevel, biomeData)

  // Phase 1: Generate terrain within this sub-chunk's Y range (with biome blending)
  const { hasTerrainAbove, maxSolidY } = generateSubChunkTerrain(
    subChunk,
    noise,
    seed,
    seaLevel,
    terrainThickness,
    minWorldY,
    maxWorldY,
    biomeData
  )

  // Phase 2: Carve caves (only within this Y range, uses primary biome settings)
  const caves = biomeConfig.caves
  if (caves?.enabled) {
    const caveCarver = new CaveCarver(seed)
    await caveCarver.carveSubChunk(subChunk, caves, getHeight, minWorldY, maxWorldY)
  }

  // Phase 2.5: Apply water to terrain depressions (after caves, before skylight)
  // Water only fills open-air depressions above terrain surface, not caves
  const waterSettings = biomeConfig.water
  let waterEdgeEffects: WaterEdgeEffects | undefined
  if (waterSettings?.enabled) {
    const waterFeature = new WaterFeature(waterSettings)
    const waterContext: FeatureContext = {
      chunk: subChunk,
      world: null,
      noise,
      config: { seed, seaLevel, terrainThickness, chunkDistance: 8 },
      biomeProperties: {
        name: biomeConfig.name,
        frequency: 1.0,
        treeDensity: biomeConfig.treeDensity,
        features: [],
        caves: biomeConfig.caves,
        water: biomeConfig.water,
        terrainConfig: biomeConfig.terrainConfig,
      },
      getBaseHeightAt: getHeight,
    }
    waterEdgeEffects = await waterFeature.scanWithEdgeEffects(waterContext)
  }

  // Phase 3: Apply provisional skylight (uses blended height)
  applyProvisionalSkylight(subChunk, noise, seaLevel, minWorldY, maxWorldY, biomeData)

  // Phase 4: Apply ore features and collect positions (uses primary biome)
  const orePositions: OrePosition[] = []
  const features = createFeatures(biomeConfig.features)

  // Create feature context for this sub-chunk
  const featureContext: FeatureContext = {
    chunk: subChunk,
    world: null, // Workers don't have access to world
    noise,
    config: { seed, seaLevel, terrainThickness, chunkDistance: 8 },
    biomeProperties: {
      name: biomeConfig.name,
      frequency: 1.0, // Not used in worker context
      treeDensity: biomeConfig.treeDensity,
      features: [],
      caves: biomeConfig.caves,
      water: biomeConfig.water,
      terrainConfig: biomeConfig.terrainConfig,
    },
    getBaseHeightAt: getHeight,
  }

  // Apply ore features and collect positions
  for (const feature of features) {
    if (feature instanceof OreFeature) {
      // Check if ore Y range overlaps with this sub-chunk
      const oreMinY = feature.settings.minY
      const oreMaxY = feature.settings.maxY
      if (oreMaxY >= minWorldY && oreMinY <= maxWorldY) {
        const positions = feature.scanWithPositions(featureContext)
        // Filter to only positions within this sub-chunk's Y range
        for (const pos of positions) {
          if (pos.y >= minWorldY && pos.y <= maxWorldY) {
            orePositions.push(pos)
          }
        }
      }
    }
  }

  // Phase 5: Compute opacity for occlusion culling (done in worker to avoid main thread work)
  const blockData = subChunk.getBlockData()
  let isFullyOpaque = true
  for (let i = 0; i < blockData.length; i++) {
    const block = getBlock(blockData[i])
    if (!block.properties.isOpaque) {
      isFullyOpaque = false
      break
    }
  }

  return {
    type: 'subchunk-result',
    chunkX,
    chunkZ,
    subY,
    blocks: blockData,
    lightData: subChunk.getLightData(),
    hasTerrainAbove,
    maxSolidY,
    orePositions,
    isFullyOpaque,
    waterEdgeEffects,
  }
}

// Worker message handler
type WorkerRequest = ChunkGenerationRequest | SubChunkGenerationRequest

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  try {
    if (request.type === 'generate-subchunk') {
      // Handle sub-chunk generation
      const result = await generateSubChunk(request)

      // Transfer buffers back (zero-copy)
      self.postMessage(result, {
        transfer: [result.blocks.buffer, result.lightData.buffer],
      })
    } else {
      // Handle full chunk generation (legacy)
      const result = await generateChunk(request)

      // Transfer buffers back (zero-copy)
      self.postMessage(result, {
        transfer: [result.blocks.buffer, result.lightData.buffer],
      })
    }
  } catch (error) {
    if (request.type === 'generate-subchunk') {
      const errorResponse: SubChunkGenerationError = {
        type: 'subchunk-error',
        chunkX: request.chunkX,
        chunkZ: request.chunkZ,
        subY: request.subY,
        error: String(error),
      }
      self.postMessage(errorResponse)
    } else {
      const errorResponse: ChunkGenerationError = {
        type: 'generate-error',
        chunkX: request.chunkX,
        chunkZ: request.chunkZ,
        error: String(error),
      }
      self.postMessage(errorResponse)
    }
  }
}
