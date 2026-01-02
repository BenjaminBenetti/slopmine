import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import type { SubChunkOpacityCache } from './SubChunkOpacityCache.ts'
import { createSubChunkKey, parseSubChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../world/interfaces/IChunk.ts'

// Types matching the worker
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
  viewProjectionMatrix: Float32Array
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

export interface SoftwareOcclusionStats {
  occluderCount: number
  candidateCount: number
  occludedCount: number
}

/**
 * Software 3D occlusion culling using a Web Worker.
 * Rasterizes opaque sub-chunk bounding boxes into a depth buffer,
 * then tests candidate sub-chunks for occlusion.
 *
 * Uses 1-frame latency: applies previous frame's results while calculating current frame.
 */
export class SoftwareOcclusionCuller {
  private readonly worker: Worker
  private pendingResult: Set<string> | null = null
  private frameId = 0
  private lastStats: SoftwareOcclusionStats = {
    occluderCount: 0,
    candidateCount: 0,
    occludedCount: 0,
  }

  constructor() {
    this.worker = new Worker(new URL('../workers/SoftwareOcclusionWorker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = this.handleResult.bind(this)
  }

  private handleResult(event: MessageEvent<OcclusionResponse>): void {
    if (event.data.type === 'result') {
      this.pendingResult = new Set(event.data.occludedIds)
      this.lastStats = event.data.stats
    }
  }

  /**
   * Get the latest occlusion statistics.
   */
  getStats(): SoftwareOcclusionStats {
    return this.lastStats
  }

  /**
   * Update visibility of sub-chunks based on software occlusion culling.
   * Applies previous frame's results and dispatches current frame's work to worker.
   */
  updateVisibility(
    camera: THREE.PerspectiveCamera,
    chunkMeshes: Iterable<ChunkMesh>,
    opacityCache: SubChunkOpacityCache
  ): void {
    const candidates: SubChunkBounds[] = []
    const meshMap = new Map<SubChunkKey, ChunkMesh>()

    // Collect sub-chunks that passed frustum culling
    for (const chunkMesh of chunkMeshes) {
      const group = chunkMesh.getGroup()
      if (!group.visible) continue

      // Only process sub-chunks, not legacy full-height chunks
      if (chunkMesh.subY === null) continue

      const coord = chunkMesh.chunkCoordinate
      const id = createSubChunkKey(coord.x, coord.z, chunkMesh.subY)
      const bounds = this.getSubChunkBounds(chunkMesh)

      candidates.push({ id, ...bounds })
      meshMap.set(id, chunkMesh)
    }

    // Apply previous frame's occlusion results
    if (this.pendingResult) {
      for (const [id, mesh] of meshMap) {
        if (this.pendingResult.has(id)) {
          mesh.getGroup().visible = false
        }
      }
    }

    // Build occluder list from opacity cache
    // Opaque sub-chunks may not have meshes (they're fully buried), so compute bounds from coordinates
    const occluders: SubChunkBounds[] = []
    for (const opaqueKey of opacityCache.getOpaqueSubChunks()) {
      occluders.push(this.getSubChunkBoundsFromKey(opaqueKey))
    }

    // Dispatch this frame's work to worker
    this.dispatchRequest(camera, occluders, candidates)
  }

  private getSubChunkBounds(mesh: ChunkMesh): Omit<SubChunkBounds, 'id'> {
    const coord = mesh.chunkCoordinate
    const worldX = Number(coord.x) * CHUNK_SIZE_X
    const worldZ = Number(coord.z) * CHUNK_SIZE_Z
    const worldY = mesh.subY! * SUB_CHUNK_HEIGHT

    return {
      minX: worldX,
      minY: worldY,
      minZ: worldZ,
      maxX: worldX + CHUNK_SIZE_X,
      maxY: worldY + SUB_CHUNK_HEIGHT,
      maxZ: worldZ + CHUNK_SIZE_Z,
    }
  }

  private getSubChunkBoundsFromKey(key: SubChunkKey): SubChunkBounds {
    const coord = parseSubChunkKey(key)
    const worldX = Number(coord.x) * CHUNK_SIZE_X
    const worldZ = Number(coord.z) * CHUNK_SIZE_Z
    const worldY = coord.subY * SUB_CHUNK_HEIGHT

    return {
      id: key,
      minX: worldX,
      minY: worldY,
      minZ: worldZ,
      maxX: worldX + CHUNK_SIZE_X,
      maxY: worldY + SUB_CHUNK_HEIGHT,
      maxZ: worldZ + CHUNK_SIZE_Z,
    }
  }

  private dispatchRequest(
    camera: THREE.PerspectiveCamera,
    occluders: SubChunkBounds[],
    candidates: SubChunkBounds[]
  ): void {
    this.frameId++

    // Compute view-projection matrix
    camera.updateMatrixWorld()
    const vpMatrix = new THREE.Matrix4()
    vpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)

    const request: OcclusionRequest = {
      type: 'occlusion',
      frameId: this.frameId,
      viewProjectionMatrix: new Float32Array(vpMatrix.elements),
      occluders,
      candidates,
    }

    this.worker.postMessage(request)
  }

  dispose(): void {
    this.worker.terminate()
  }
}
