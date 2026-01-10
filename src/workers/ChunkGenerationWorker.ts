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
import { WaterFeature } from '../world/generate/features/WaterFeature.ts'
import { Feature, type FeatureContext } from '../world/generate/features/Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import { localToWorld } from '../world/coordinates/CoordinateUtils.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'
import type { CaveSettings, WaterSettings } from '../world/generate/BiomeGenerator.ts'
import type { IGenerationConfig } from '../world/generate/GenerationConfig.ts'
import type { BlockId } from '../world/interfaces/IBlock.ts'

// Initialize block registry in worker context
registerDefaultBlocks()

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
  surfaceBlock: BlockId
  subsurfaceBlock: BlockId
  subsurfaceDepth: number
  baseBlock: BlockId
  heightAmplitude: number
  heightOffset: number
  treeDensity: number
  features: FeatureConfig[]
  caves?: CaveSettings
  water?: WaterSettings
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
 */
function getHeightAt(
  noise: SimplexNoise,
  worldX: number,
  worldZ: number,
  seaLevel: number,
  biomeConfig: WorkerBiomeConfig
): number {
  const baseNoise = noise.fractalNoise2D(worldX, worldZ, 4, 0.5, 0.01)
  const { heightAmplitude, heightOffset } = biomeConfig
  return Math.floor(seaLevel + heightOffset + baseNoise * heightAmplitude)
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
 * Uses bilinear interpolation at corners for seamless transitions.
 */
function getBlendedHeightAt(
  noise: SimplexNoise,
  worldX: number,
  worldZ: number,
  seaLevel: number,
  biomeData: BiomeBlendData
): number {
  const { primary } = biomeData

  // Get base noise (same for all biomes)
  const baseNoise = noise.fractalNoise2D(worldX, worldZ, 4, 0.5, 0.01)

  // Calculate distance to nearest boundary for each axis
  const xBoundary = getDistanceToBoundary(worldX)
  const zBoundary = getDistanceToBoundary(worldZ)

  const xInBlend = xBoundary.distance < BLEND_DISTANCE
  const zInBlend = zBoundary.distance < BLEND_DISTANCE

  let blendedAmplitude: number
  let blendedOffset: number

  if (xInBlend && zInBlend) {
    // Corner case: use bilinear interpolation between 4 biomes
    const [b00, b10, b01, b11] = getCornerBiomes(
      biomeData,
      xBoundary.neighborDirection,
      zBoundary.neighborDirection
    )

    // Blend factors: 0.5 at boundary, 0 at edge of blend zone
    // u represents "how much toward X neighbor" (0.5 at boundary)
    // v represents "how much toward Z neighbor" (0.5 at boundary)
    const u = 0.5 * (1 - smoothstep(xBoundary.distance / BLEND_DISTANCE))
    const v = 0.5 * (1 - smoothstep(zBoundary.distance / BLEND_DISTANCE))

    // Bilinear interpolation of parameters
    blendedAmplitude = bilerp(
      [b00.heightAmplitude, b10.heightAmplitude, b01.heightAmplitude, b11.heightAmplitude],
      u, v
    )
    blendedOffset = bilerp(
      [b00.heightOffset, b10.heightOffset, b01.heightOffset, b11.heightOffset],
      u, v
    )
  } else if (xInBlend) {
    // Only X axis blending
    const neighbor = xBoundary.neighborDirection === -1
      ? (biomeData.west ?? primary)
      : (biomeData.east ?? primary)
    // t: 0.5 at boundary, 1.0 at edge of blend zone (fully primary)
    const t = 0.5 + 0.5 * smoothstep(xBoundary.distance / BLEND_DISTANCE)
    blendedAmplitude = lerp(neighbor.heightAmplitude, primary.heightAmplitude, t)
    blendedOffset = lerp(neighbor.heightOffset, primary.heightOffset, t)
  } else if (zInBlend) {
    // Only Z axis blending
    const neighbor = zBoundary.neighborDirection === -1
      ? (biomeData.north ?? primary)
      : (biomeData.south ?? primary)
    const t = 0.5 + 0.5 * smoothstep(zBoundary.distance / BLEND_DISTANCE)
    blendedAmplitude = lerp(neighbor.heightAmplitude, primary.heightAmplitude, t)
    blendedOffset = lerp(neighbor.heightOffset, primary.heightOffset, t)
  } else {
    // No blending needed
    blendedAmplitude = primary.heightAmplitude
    blendedOffset = primary.heightOffset
  }

  // Compute height with blended parameters
  return Math.floor(seaLevel + blendedOffset + baseNoise * blendedAmplitude)
}

/**
 * Fill a column with layered blocks.
 */
function fillColumn(
  chunk: WorkerChunk,
  localX: number,
  localZ: number,
  height: number,
  biomeConfig: WorkerBiomeConfig
): void {
  const { surfaceBlock, subsurfaceBlock, subsurfaceDepth, baseBlock } = biomeConfig

  for (let y = 0; y <= height; y++) {
    let blockId: number

    if (y === height) {
      blockId = surfaceBlock
    } else if (y > height - subsurfaceDepth) {
      blockId = subsurfaceBlock
    } else {
      blockId = baseBlock
    }

    chunk.setBlockId(localX, y, localZ, blockId)
  }
}

/**
 * Generate terrain for the chunk.
 */
function generateTerrain(
  chunk: WorkerChunk,
  noise: SimplexNoise,
  seaLevel: number,
  biomeConfig: WorkerBiomeConfig
): void {
  const coord = chunk.coordinate

  for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
      const worldX = Number(worldCoord.x)
      const worldZ = Number(worldCoord.z)

      const height = getHeightAt(noise, worldX, worldZ, seaLevel, biomeConfig)
      fillColumn(chunk, localX, localZ, height, biomeConfig)
    }
  }
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

  // Phase 1: Generate terrain
  generateTerrain(chunk, noise, seaLevel, biomeConfig)

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
 * Fill a column within a sub-chunk's Y range.
 */
function fillSubChunkColumn(
  subChunk: WorkerSubChunk,
  localX: number,
  localZ: number,
  terrainHeight: number,
  terrainThickness: number,
  minWorldY: number,
  maxWorldY: number,
  biomeConfig: WorkerBiomeConfig
): { hasTerrainAbove: boolean; maxSolidY: number } {
  const { surfaceBlock, subsurfaceBlock, subsurfaceDepth, baseBlock } = biomeConfig

  let hasTerrainAbove = false
  let maxSolidY = -1

  // Calculate terrain floor (below this is air)
  const terrainFloor = terrainHeight - terrainThickness

  // Check if terrain extends above this sub-chunk
  if (terrainHeight > maxWorldY) {
    hasTerrainAbove = true
  }

  // Fill blocks within this sub-chunk's Y range
  for (let worldY = minWorldY; worldY <= maxWorldY; worldY++) {
    const localY = worldY - minWorldY

    // Only fill blocks between terrain floor and terrain height (air below floor)
    if (worldY <= terrainHeight && worldY > terrainFloor) {
      let blockId: BlockId

      if (worldY === terrainHeight) {
        blockId = surfaceBlock
      } else if (worldY > terrainHeight - subsurfaceDepth) {
        blockId = subsurfaceBlock
      } else {
        blockId = baseBlock
      }

      subChunk.setBlockId(localX, localY, localZ, blockId)
      maxSolidY = worldY
    }
  }

  return { hasTerrainAbove, maxSolidY }
}

/**
 * Generate terrain for a sub-chunk with biome blending.
 */
function generateSubChunkTerrain(
  subChunk: WorkerSubChunk,
  noise: SimplexNoise,
  seaLevel: number,
  terrainThickness: number,
  minWorldY: number,
  maxWorldY: number,
  biomeData: BiomeBlendData
): { hasTerrainAbove: boolean; maxSolidY: number } {
  const coord = subChunk.coordinate
  let hasTerrainAbove = false
  let maxSolidY = -1

  for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      const worldCoord = localToWorld(
        { x: coord.x, z: coord.z },
        { x: localX, y: 0, z: localZ }
      )
      const worldX = Number(worldCoord.x)
      const worldZ = Number(worldCoord.z)

      // Use blended height for smooth biome transitions
      const terrainHeight = getBlendedHeightAt(noise, worldX, worldZ, seaLevel, biomeData)
      // Use primary biome for block types (no blending for blocks)
      const result = fillSubChunkColumn(
        subChunk,
        localX,
        localZ,
        terrainHeight,
        terrainThickness,
        minWorldY,
        maxWorldY,
        biomeData.primary
      )

      if (result.hasTerrainAbove) hasTerrainAbove = true
      if (result.maxSolidY > maxSolidY) maxSolidY = result.maxSolidY
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
        surfaceBlock: biomeConfig.surfaceBlock,
        subsurfaceBlock: biomeConfig.subsurfaceBlock,
        subsurfaceDepth: biomeConfig.subsurfaceDepth,
        baseBlock: biomeConfig.baseBlock,
        heightAmplitude: biomeConfig.heightAmplitude,
        heightOffset: biomeConfig.heightOffset,
        treeDensity: biomeConfig.treeDensity,
        features: [],
        caves: biomeConfig.caves,
        water: biomeConfig.water,
      },
      getBaseHeightAt: getHeight,
    }
    await waterFeature.scan(waterContext)
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
      surfaceBlock: biomeConfig.surfaceBlock,
      subsurfaceBlock: biomeConfig.subsurfaceBlock,
      subsurfaceDepth: biomeConfig.subsurfaceDepth,
      baseBlock: biomeConfig.baseBlock,
      heightAmplitude: biomeConfig.heightAmplitude,
      heightOffset: biomeConfig.heightOffset,
      treeDensity: biomeConfig.treeDensity,
      features: [],
      caves: biomeConfig.caves,
      water: biomeConfig.water,
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
