/**
 * Software Occlusion Culling Worker
 *
 * Performs 3D software occlusion culling using a low-resolution depth buffer.
 * Rasterizes opaque sub-chunk bounding boxes as occluders, then tests
 * candidate sub-chunks against the depth buffer.
 */

// Depth buffer resolution (512x256 = 131,072 pixels)
const DEPTH_WIDTH = 512
const DEPTH_HEIGHT = 256
const depthBuffer = new Float32Array(DEPTH_WIDTH * DEPTH_HEIGHT)

// Request/Response types
interface SubChunkBounds {
  id: string
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

interface OcclusionRequest {
  type: 'occlusion'
  frameId: number
  viewProjectionMatrix: Float32Array // 16 elements (4x4 matrix)
  occluders: SubChunkBounds[]
  candidates: SubChunkBounds[]
}

interface OcclusionResponse {
  type: 'result'
  frameId: number
  occludedIds: string[]
  stats: {
    occluderCount: number
    candidateCount: number
    occludedCount: number
  }
}

interface ProjectedAABB {
  screenMinX: number
  screenMinY: number
  screenMaxX: number
  screenMaxY: number
  minDepth: number // Closest point (0 = near, 1 = far)
  maxDepth: number // Farthest point
  behindCamera: boolean
  fullyClipped: boolean
}

/**
 * Project an AABB to screen space using the view-projection matrix.
 */
function projectAABB(bounds: SubChunkBounds, vpMatrix: Float32Array): ProjectedAABB {
  // 8 corners of the AABB
  const corners = [
    [bounds.minX, bounds.minY, bounds.minZ],
    [bounds.maxX, bounds.minY, bounds.minZ],
    [bounds.minX, bounds.maxY, bounds.minZ],
    [bounds.maxX, bounds.maxY, bounds.minZ],
    [bounds.minX, bounds.minY, bounds.maxZ],
    [bounds.maxX, bounds.minY, bounds.maxZ],
    [bounds.minX, bounds.maxY, bounds.maxZ],
    [bounds.maxX, bounds.maxY, bounds.maxZ],
  ]

  let screenMinX = Infinity
  let screenMinY = Infinity
  let screenMaxX = -Infinity
  let screenMaxY = -Infinity
  let minDepth = Infinity
  let maxDepth = -Infinity
  let behindCamera = false
  let validPoints = 0

  for (const [x, y, z] of corners) {
    // Multiply by view-projection matrix (column-major order)
    const clipX = vpMatrix[0] * x + vpMatrix[4] * y + vpMatrix[8] * z + vpMatrix[12]
    const clipY = vpMatrix[1] * x + vpMatrix[5] * y + vpMatrix[9] * z + vpMatrix[13]
    const clipZ = vpMatrix[2] * x + vpMatrix[6] * y + vpMatrix[10] * z + vpMatrix[14]
    const clipW = vpMatrix[3] * x + vpMatrix[7] * y + vpMatrix[11] * z + vpMatrix[15]

    // Check if behind camera (w <= 0)
    if (clipW <= 0.001) {
      behindCamera = true
      continue
    }

    validPoints++

    // Perspective divide to NDC
    const ndcX = clipX / clipW
    const ndcY = clipY / clipW
    const ndcZ = clipZ / clipW

    // NDC to screen space
    const screenX = (ndcX * 0.5 + 0.5) * DEPTH_WIDTH
    const screenY = (1.0 - (ndcY * 0.5 + 0.5)) * DEPTH_HEIGHT // Flip Y

    screenMinX = Math.min(screenMinX, screenX)
    screenMinY = Math.min(screenMinY, screenY)
    screenMaxX = Math.max(screenMaxX, screenX)
    screenMaxY = Math.max(screenMaxY, screenY)

    // Depth in NDC (0 = near, 1 = far for typical projection)
    const depth = ndcZ * 0.5 + 0.5
    minDepth = Math.min(minDepth, depth)
    maxDepth = Math.max(maxDepth, depth)
  }

  return {
    screenMinX,
    screenMinY,
    screenMaxX,
    screenMaxY,
    minDepth,
    maxDepth,
    behindCamera,
    fullyClipped: validPoints === 0,
  }
}

/**
 * Rasterize an occluder into the depth buffer.
 * Uses conservative approach: writes minimum depth (closest point).
 */
function rasterizeOccluder(projected: ProjectedAABB): void {
  // Skip if behind camera or fully clipped
  if (projected.fullyClipped) return

  // If partially behind camera, we can't reliably rasterize
  // (would need proper clipping). Skip for safety.
  if (projected.behindCamera) return

  // Clamp to screen bounds
  const x0 = Math.max(0, Math.floor(projected.screenMinX))
  const y0 = Math.max(0, Math.floor(projected.screenMinY))
  const x1 = Math.min(DEPTH_WIDTH - 1, Math.ceil(projected.screenMaxX))
  const y1 = Math.min(DEPTH_HEIGHT - 1, Math.ceil(projected.screenMaxY))

  // Skip if outside screen
  if (x0 > x1 || y0 > y1) return

  // Write minimum depth (closest point) to all covered pixels
  // Only overwrite if new depth is closer
  const depth = projected.minDepth

  for (let y = y0; y <= y1; y++) {
    const rowOffset = y * DEPTH_WIDTH
    for (let x = x0; x <= x1; x++) {
      const idx = rowOffset + x
      if (depth < depthBuffer[idx]) {
        depthBuffer[idx] = depth
      }
    }
  }
}

/**
 * Test if a candidate is visible (not fully occluded).
 * Uses conservative approach: visible if ANY sample point passes depth test.
 */
function testVisibility(projected: ProjectedAABB): boolean {
  // If behind camera, must be visible (conservative)
  if (projected.behindCamera) return true

  // If fully clipped, skip
  if (projected.fullyClipped) return true

  // If outside screen, visible (handled by frustum culler)
  if (
    projected.screenMaxX < 0 ||
    projected.screenMinX >= DEPTH_WIDTH ||
    projected.screenMaxY < 0 ||
    projected.screenMinY >= DEPTH_HEIGHT
  ) {
    return true
  }

  // Clamp sample positions to screen
  const x0 = Math.max(0, Math.floor(projected.screenMinX))
  const y0 = Math.max(0, Math.floor(projected.screenMinY))
  const x1 = Math.min(DEPTH_WIDTH - 1, Math.ceil(projected.screenMaxX))
  const y1 = Math.min(DEPTH_HEIGHT - 1, Math.ceil(projected.screenMaxY))
  const xMid = Math.floor((x0 + x1) / 2)
  const yMid = Math.floor((y0 + y1) / 2)

  // Sample 5 points: 4 corners + center
  const samples = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
    [xMid, yMid],
  ]

  // Use max depth (farthest point) for conservative testing
  const candidateDepth = projected.maxDepth

  for (const [x, y] of samples) {
    const bufferDepth = depthBuffer[y * DEPTH_WIDTH + x]
    // If candidate's farthest point is in front of depth buffer, it's visible
    if (candidateDepth < bufferDepth) {
      return true
    }
  }

  // All samples are occluded
  return false
}

/**
 * Clear the depth buffer to far plane.
 */
function clearDepthBuffer(): void {
  depthBuffer.fill(1.0)
}

/**
 * Process occlusion culling request.
 */
function processOcclusionRequest(request: OcclusionRequest): OcclusionResponse {
  const { frameId, viewProjectionMatrix, occluders, candidates } = request

  // Step 1: Clear depth buffer
  clearDepthBuffer()

  // Step 2: Sort occluders front-to-back for early depth writes
  // (optional optimization - skip for now as it adds overhead)

  // Step 3: Rasterize all occluders
  for (const occluder of occluders) {
    const projected = projectAABB(occluder, viewProjectionMatrix)
    rasterizeOccluder(projected)
  }

  // Step 4: Test all candidates
  const occludedIds: string[] = []
  for (const candidate of candidates) {
    const projected = projectAABB(candidate, viewProjectionMatrix)
    if (!testVisibility(projected)) {
      occludedIds.push(candidate.id)
    }
  }

  return {
    type: 'result',
    frameId,
    occludedIds,
    stats: {
      occluderCount: occluders.length,
      candidateCount: candidates.length,
      occludedCount: occludedIds.length,
    },
  }
}

// Worker message handler
self.onmessage = (e: MessageEvent<OcclusionRequest>) => {
  if (e.data.type === 'occlusion') {
    const response = processOcclusionRequest(e.data)
    self.postMessage(response)
  }
}
