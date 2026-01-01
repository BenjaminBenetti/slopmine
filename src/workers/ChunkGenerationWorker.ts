/**
 * Web Worker for chunk terrain generation.
 * Handles: terrain, caves, initial skylight, features, tree position calculation.
 * Does NOT handle: actual tree placement (crosses chunk boundaries).
 *
 * Receives biome config from main thread - no duplicated configuration here.
 */

import { WorkerChunk } from './WorkerChunk.ts'
import { SimplexNoise } from '../world/generate/SimplexNoise.ts'
import { CaveCarver } from '../world/generate/caves/CaveCarver.ts'
import { SkylightPropagator } from '../world/lighting/SkylightPropagator.ts'
import { CliffFeature, type CliffFeatureSettings } from '../world/generate/features/CliffFeature.ts'
import { Feature, type FeatureContext } from '../world/generate/features/Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'
import { localToWorld } from '../world/coordinates/CoordinateUtils.ts'
import type { CaveSettings } from '../world/generate/BiomeGenerator.ts'
import type { IGenerationConfig } from '../world/generate/GenerationConfig.ts'
import type { BlockId } from '../world/interfaces/IBlock.ts'

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
function generateChunk(request: ChunkGenerationRequest): ChunkGenerationResponse {
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
    caveCarver.carve(chunk, caves, getHeight)
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
      feature.scan(featureContext)
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

// Worker message handler
self.onmessage = (event: MessageEvent<ChunkGenerationRequest>) => {
  try {
    const result = generateChunk(event.data)

    // Transfer buffers back (zero-copy)
    self.postMessage(result, {
      transfer: [result.blocks.buffer, result.lightData.buffer],
    })
  } catch (error) {
    const errorResponse: ChunkGenerationError = {
      type: 'generate-error',
      chunkX: event.data.chunkX,
      chunkZ: event.data.chunkZ,
      error: String(error),
    }
    self.postMessage(errorResponse)
  }
}
