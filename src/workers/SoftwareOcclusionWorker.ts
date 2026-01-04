/**
 * Software Occlusion Culling Worker
 *
 * Performs 3D software occlusion culling using a low-resolution depth buffer.
 * Rasterizes opaque sub-chunk bounding boxes as occluders, then tests
 * candidate sub-chunks against the depth buffer.
 */

// Depth buffer resolution
const DEPTH_WIDTH = 256
const DEPTH_HEIGHT = 128
const depthBuffer = new Float32Array(DEPTH_WIDTH * DEPTH_HEIGHT)

// Depth bias to reduce flickering on borderline cases
// Higher values = more conservative (fewer false occlusions, but less culling)
const DEPTH_BIAS = 0.002

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
function testVisibility(
  projected: ProjectedAABB,
  bounds: SubChunkBounds,
  vpMatrix: Float32Array
): boolean {
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

  // Sample 9 points: 4 corners + center + 4 edge midpoints
  const samples = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
    [xMid, yMid],
    [xMid, y0],
    [xMid, y1],
    [x0, yMid],
    [x1, yMid],
  ]

  // Use min depth (closest point) for conservative testing
  // If the closest point of the chunk is in front of the occluder, it's visible
  const candidateDepth = projected.minDepth

  for (const [x, y] of samples) {
    const bufferDepth = depthBuffer[y * DEPTH_WIDTH + x]
    // If candidate's closest point is in front of (or near) depth buffer, it's visible
    if (candidateDepth < bufferDepth + DEPTH_BIAS) {
      return true
    }
  }

  // Test the 3D center point with its actual depth
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  const centerY = (bounds.minY + bounds.maxY) * 0.5
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5

  // Project the center point
  const clipX =
    vpMatrix[0] * centerX + vpMatrix[4] * centerY + vpMatrix[8] * centerZ + vpMatrix[12]
  const clipY =
    vpMatrix[1] * centerX + vpMatrix[5] * centerY + vpMatrix[9] * centerZ + vpMatrix[13]
  const clipZ =
    vpMatrix[2] * centerX + vpMatrix[6] * centerY + vpMatrix[10] * centerZ + vpMatrix[14]
  const clipW =
    vpMatrix[3] * centerX + vpMatrix[7] * centerY + vpMatrix[11] * centerZ + vpMatrix[15]

  if (clipW > 0.001) {
    const ndcX = clipX / clipW
    const ndcY = clipY / clipW
    const ndcZ = clipZ / clipW

    const screenX = Math.floor((ndcX * 0.5 + 0.5) * DEPTH_WIDTH)
    const screenY = Math.floor((1.0 - (ndcY * 0.5 + 0.5)) * DEPTH_HEIGHT)
    const centerDepth = ndcZ * 0.5 + 0.5

    // Check if center point is on screen and visible
    if (screenX >= 0 && screenX < DEPTH_WIDTH && screenY >= 0 && screenY < DEPTH_HEIGHT) {
      const bufferDepth = depthBuffer[screenY * DEPTH_WIDTH + screenX]
      if (centerDepth < bufferDepth + DEPTH_BIAS) {
        return true
      }
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
    if (!testVisibility(projected, candidate, viewProjectionMatrix)) {
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
