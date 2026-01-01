/**
 * Web Worker for horizon-based occlusion culling.
 * Offloads ray marching calculations from the main thread.
 * Uses dual-height system: surface heights for targets, grounded heights for blocking.
 */

// Chunk constants (duplicated to avoid import issues in worker)
const CHUNK_SIZE_X = 32
const CHUNK_SIZE_Z = 32

// Heightmap sampling constants
const SAMPLES_PER_AXIS = 4
const SAMPLE_SPACING = CHUNK_SIZE_X / SAMPLES_PER_AXIS // 8 blocks

// Ray march constants
const RAY_STEP = 8
const HEIGHT_MARGIN = 4

// Sample offsets for conservative culling (4 corners + center)
const SAMPLE_OFFSETS = [
  { x: 0, z: 0 },
  { x: CHUNK_SIZE_X, z: 0 },
  { x: 0, z: CHUNK_SIZE_Z },
  { x: CHUNK_SIZE_X, z: CHUNK_SIZE_Z },
  { x: CHUNK_SIZE_X / 2, z: CHUNK_SIZE_Z / 2 },
]

export interface OcclusionRequest {
  type: 'cull'
  frameId: number
  camera: { x: number; y: number; z: number }
  chunks: Array<{
    id: string
    worldX: number
    worldZ: number
    maxHeight: number
  }>
  heightmap: {
    surfaceSamples: Array<[string, Float32Array]>
    groundedSamples: Array<[string, Float32Array]>
    maxHeights: Array<[string, number]>
  }
}

export interface OcclusionResponse {
  type: 'cull-result'
  frameId: number
  occludedChunkIds: string[]
}

// Reconstructed heightmap data
let surfaceHeights: Map<string, Float32Array>
let groundedHeights: Map<string, Float32Array>

function loadHeightmap(data: OcclusionRequest['heightmap']): void {
  surfaceHeights = new Map(data.surfaceSamples)
  groundedHeights = new Map(data.groundedSamples)
}

/**
 * Bilinear interpolation for height lookup.
 */
function interpolateHeight(
  worldX: number,
  worldZ: number,
  samples: Map<string, Float32Array>
): number {
  const chunkX = Math.floor(worldX / CHUNK_SIZE_X)
  const chunkZ = Math.floor(worldZ / CHUNK_SIZE_Z)
  const key = `${chunkX},${chunkZ}`

  const sampleData = samples.get(key)
  if (!sampleData) return 0

  const localX = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X
  const localZ = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z

  const sampleX = localX / SAMPLE_SPACING
  const sampleZ = localZ / SAMPLE_SPACING

  const sx0 = Math.floor(sampleX)
  const sz0 = Math.floor(sampleZ)
  const sx1 = Math.min(sx0 + 1, SAMPLES_PER_AXIS - 1)
  const sz1 = Math.min(sz0 + 1, SAMPLES_PER_AXIS - 1)

  const fx = sampleX - sx0
  const fz = sampleZ - sz0

  const h00 = sampleData[sz0 * SAMPLES_PER_AXIS + sx0]
  const h10 = sampleData[sz0 * SAMPLES_PER_AXIS + sx1]
  const h01 = sampleData[sz1 * SAMPLES_PER_AXIS + sx0]
  const h11 = sampleData[sz1 * SAMPLES_PER_AXIS + sx1]

  const h0 = h00 * (1 - fx) + h10 * fx
  const h1 = h01 * (1 - fx) + h11 * fx
  return h0 * (1 - fz) + h1 * fz
}

/** Get surface height (top-down) for ray targets */
function getSurfaceHeight(worldX: number, worldZ: number): number {
  return interpolateHeight(worldX, worldZ, surfaceHeights)
}

/** Get grounded height (bottom-up) for ray blocking */
function getGroundedHeight(worldX: number, worldZ: number): number {
  return interpolateHeight(worldX, worldZ, groundedHeights)
}

/**
 * Ray march from camera to target point, checking for terrain occlusion.
 * Uses GROUNDED heights for blocking - only solid terrain blocks view.
 */
function isPointVisible(
  camX: number,
  camY: number,
  camZ: number,
  targetX: number,
  targetY: number,
  targetZ: number
): boolean {
  const dx = targetX - camX
  const dz = targetZ - camZ
  const dy = targetY - camY

  const distXZ = Math.sqrt(dx * dx + dz * dz)

  if (distXZ < RAY_STEP) return true

  const dirX = dx / distXZ
  const dirZ = dz / distXZ
  const dirY = dy / distXZ

  const steps = Math.ceil(distXZ / RAY_STEP)

  for (let i = 1; i < steps; i++) {
    const t = i * RAY_STEP
    const rayX = camX + dirX * t
    const rayZ = camZ + dirZ * t
    const rayY = camY + dirY * t

    // Use GROUNDED height for blocking
    const terrainHeight = getGroundedHeight(rayX, rayZ)

    if (terrainHeight > rayY) {
      return false
    }
  }

  return true
}

/**
 * Check if a chunk is occluded by testing sample points.
 */
function isChunkOccluded(
  camX: number,
  camY: number,
  camZ: number,
  chunkWorldX: number,
  chunkWorldZ: number,
  chunkMaxHeight: number
): boolean {
  // Quick check: if chunk max height is well below camera, likely visible
  if (chunkMaxHeight < camY - HEIGHT_MARGIN * 2) {
    return false
  }

  // Conservative culling: chunk is visible if ANY sample point is visible
  for (const offset of SAMPLE_OFFSETS) {
    const targetX = chunkWorldX + offset.x
    const targetZ = chunkWorldZ + offset.z

    // Use SURFACE height for target (what we're trying to see)
    const targetHeight = getSurfaceHeight(targetX, targetZ) + HEIGHT_MARGIN

    if (isPointVisible(camX, camY, camZ, targetX, targetHeight, targetZ)) {
      return false
    }
  }

  return true
}

/**
 * Process occlusion culling for all chunks.
 */
function processCulling(request: OcclusionRequest): OcclusionResponse {
  const { frameId, camera, chunks } = request

  loadHeightmap(request.heightmap)

  // Skip if no heightmap data
  if (surfaceHeights.size === 0) {
    return { type: 'cull-result', frameId, occludedChunkIds: [] }
  }

  const occludedChunkIds: string[] = []

  for (const chunk of chunks) {
    if (isChunkOccluded(camera.x, camera.y, camera.z, chunk.worldX, chunk.worldZ, chunk.maxHeight)) {
      occludedChunkIds.push(chunk.id)
    }
  }

  return { type: 'cull-result', frameId, occludedChunkIds }
}

// Worker message handler
self.onmessage = (event: MessageEvent<OcclusionRequest>) => {
  if (event.data.type === 'cull') {
    const result = processCulling(event.data)
    self.postMessage(result)
  }
}
