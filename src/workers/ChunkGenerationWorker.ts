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
import { Feature, type FeatureContext } from '../world/generate/features/Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'
import { localToWorld } from '../world/coordinates/CoordinateUtils.ts'
import { registerDefaultBlocks } from '../world/blocks/registerDefaultBlocks.ts'
import type { CaveSettings } from '../world/generate/BiomeGenerator.ts'
import type { IGenerationConfig } from '../world/generate/GenerationConfig.ts'
import type { BlockId } from '../world/interfaces/IBlock.ts'

// Initialize block registry in worker context
registerDefaultBlocks()

/**
 * Serialized feature config passed from main thread.
 */
export type FeatureConfig =
  | { type: 'cliff'; settings: CliffFeatureSettings }

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
  biomeConfig: WorkerBiomeConfig
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
      default:
        throw new Error(`Unknown feature type: ${(config as any).type}`)
    }
  })
}

/**
 * Generate terrain height at a world position.
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
  const { chunkX, chunkZ, seed, seaLevel, biomeConfig, blocks, lightData } = request

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
      biome: biomeConfig.name as 'plains' | 'grassy-hills',
      chunkDistance: 4,
    }

    // Create a minimal biome properties object for feature context
    const biomeProperties = {
      ...biomeConfig,
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
  minWorldY: number,
  maxWorldY: number,
  biomeConfig: WorkerBiomeConfig
): { hasTerrainAbove: boolean; maxSolidY: number } {
  const { surfaceBlock, subsurfaceBlock, subsurfaceDepth, baseBlock } = biomeConfig

  let hasTerrainAbove = false
  let maxSolidY = -1

  // Check if terrain extends above this sub-chunk
  if (terrainHeight > maxWorldY) {
    hasTerrainAbove = true
  }

  // Fill blocks within this sub-chunk's Y range
  for (let worldY = minWorldY; worldY <= maxWorldY; worldY++) {
    const localY = worldY - minWorldY

    if (worldY <= terrainHeight) {
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
 * Generate terrain for a sub-chunk.
 */
function generateSubChunkTerrain(
  subChunk: WorkerSubChunk,
  noise: SimplexNoise,
  seaLevel: number,
  minWorldY: number,
  maxWorldY: number,
  biomeConfig: WorkerBiomeConfig
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

      const terrainHeight = getHeightAt(noise, worldX, worldZ, seaLevel, biomeConfig)
      const result = fillSubChunkColumn(
        subChunk,
        localX,
        localZ,
        terrainHeight,
        minWorldY,
        maxWorldY,
        biomeConfig
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
  biomeConfig: WorkerBiomeConfig
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

      const terrainHeight = getHeightAt(noise, worldX, worldZ, seaLevel, biomeConfig)

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
  const { chunkX, chunkZ, subY, minWorldY, maxWorldY, seed, seaLevel, biomeConfig, blocks, lightData } = request

  // Create WorkerSubChunk with the provided buffers
  const subChunk = new WorkerSubChunk(chunkX, chunkZ, subY, blocks, lightData)

  // Create noise generator
  const noise = new SimplexNoise(seed)

  // Create height getter for caves
  const getHeight = (worldX: number, worldZ: number) =>
    getHeightAt(noise, worldX, worldZ, seaLevel, biomeConfig)

  // Phase 1: Generate terrain within this sub-chunk's Y range
  const { hasTerrainAbove, maxSolidY } = generateSubChunkTerrain(
    subChunk,
    noise,
    seaLevel,
    minWorldY,
    maxWorldY,
    biomeConfig
  )

  // Phase 2: Carve caves (only within this Y range)
  const caves = biomeConfig.caves
  if (caves?.enabled) {
    const caveCarver = new CaveCarver(seed)
    await caveCarver.carveSubChunk(subChunk, caves, getHeight, minWorldY, maxWorldY)
  }

  // Phase 3: Apply provisional skylight
  applyProvisionalSkylight(subChunk, noise, seaLevel, minWorldY, maxWorldY, biomeConfig)

  return {
    type: 'subchunk-result',
    chunkX,
    chunkZ,
    subY,
    blocks: subChunk.getBlockData(),
    lightData: subChunk.getLightData(),
    hasTerrainAbove,
    maxSolidY,
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
