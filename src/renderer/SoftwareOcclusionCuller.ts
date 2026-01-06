import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import type { SubChunkOpacityCache } from './SubChunkOpacityCache.ts'
import { parseSubChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'
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
  // Pre-allocated Set to avoid per-frame allocation - cleared and repopulated on each result
  private readonly occludedSet = new Set<string>()
  private hasResult = false
  private frameId = 0
  private lastStats: SoftwareOcclusionStats = {
    occluderCount: 0,
    candidateCount: 0,
    occludedCount: 0,
  }

  // Pre-allocated objects to avoid per-frame GC pressure
  private readonly vpMatrix = new THREE.Matrix4()
  // Pre-allocated arrays and map for updateVisibility (cleared each frame)
  private readonly candidatesPool: SubChunkBounds[] = []
  private readonly occludersPool: SubChunkBounds[] = []
  private readonly meshMap = new Map<SubChunkKey, ChunkMesh>()
  // Pre-allocated request object to avoid per-frame GC pressure
  private readonly occlusionRequest: OcclusionRequest = {
    type: 'occlusion',
    frameId: 0,
    viewProjectionMatrix: new Float32Array(16),
    occluders: [],
    candidates: [],
  }

  constructor() {
    this.worker = new Worker(new URL('../workers/SoftwareOcclusionWorker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = this.handleResult.bind(this)
  }

  private handleResult(event: MessageEvent<OcclusionResponse>): void {
    if (event.data.type === 'result') {
      // Clear and repopulate pre-allocated Set (avoids allocation)
      this.occludedSet.clear()
      for (const id of event.data.occludedIds) {
        this.occludedSet.add(id)
      }
      this.hasResult = true
      // Copy stats in place to avoid replacing the object
      this.lastStats.occluderCount = event.data.stats.occluderCount
      this.lastStats.candidateCount = event.data.stats.candidateCount
      this.lastStats.occludedCount = event.data.stats.occludedCount
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
    // Clear pools from previous frame (reuse arrays to avoid allocation)
    let candidateCount = 0
    this.meshMap.clear()

    // Collect sub-chunks that passed frustum culling
    for (const chunkMesh of chunkMeshes) {
      const group = chunkMesh.getGroup()
      if (!group.visible) continue

      // Only process sub-chunks, not legacy full-height chunks
      // Use cached key to avoid per-frame string allocation
      const id = chunkMesh.subChunkKey
      if (id === null) continue

      // Reuse or create SubChunkBounds object in pool
      if (candidateCount >= this.candidatesPool.length) {
        this.candidatesPool.push({ id: '', minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 })
      }
      const bounds = this.candidatesPool[candidateCount]
      this.getSubChunkBoundsInto(chunkMesh, bounds)
      bounds.id = id
      candidateCount++

      this.meshMap.set(id, chunkMesh)
    }

    // Apply previous frame's occlusion results
    if (this.hasResult) {
      for (const [id, mesh] of this.meshMap) {
        if (this.occludedSet.has(id)) {
          mesh.getGroup().visible = false
        }
      }
    }

    // Build occluder list from opacity cache (reuse pool)
    let occluderCount = 0
    for (const opaqueKey of opacityCache.getOpaqueSubChunks()) {
      if (occluderCount >= this.occludersPool.length) {
        this.occludersPool.push({ id: '', minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 })
      }
      this.getSubChunkBoundsFromKeyInto(opaqueKey, this.occludersPool[occluderCount])
      occluderCount++
    }

    // Dispatch this frame's work to worker
    // Set array lengths to avoid slice() allocation - arrays will be serialized with only valid elements
    this.occludersPool.length = occluderCount
    this.candidatesPool.length = candidateCount
    this.dispatchRequest(camera, this.occludersPool, this.candidatesPool)
  }

  /**
   * Write sub-chunk bounds into an existing object (avoids allocation).
   */
  private getSubChunkBoundsInto(mesh: ChunkMesh, target: SubChunkBounds): void {
    const coord = mesh.chunkCoordinate
    const worldX = Number(coord.x) * CHUNK_SIZE_X
    const worldZ = Number(coord.z) * CHUNK_SIZE_Z
    const worldY = mesh.subY! * SUB_CHUNK_HEIGHT

    target.minX = worldX
    target.minY = worldY
    target.minZ = worldZ
    target.maxX = worldX + CHUNK_SIZE_X
    target.maxY = worldY + SUB_CHUNK_HEIGHT
    target.maxZ = worldZ + CHUNK_SIZE_Z
  }

  /**
   * Write sub-chunk bounds from key into an existing object (avoids allocation).
   */
  private getSubChunkBoundsFromKeyInto(key: SubChunkKey, target: SubChunkBounds): void {
    const coord = parseSubChunkKey(key)
    const worldX = Number(coord.x) * CHUNK_SIZE_X
    const worldZ = Number(coord.z) * CHUNK_SIZE_Z
    const worldY = coord.subY * SUB_CHUNK_HEIGHT

    target.id = key
    target.minX = worldX
    target.minY = worldY
    target.minZ = worldZ
    target.maxX = worldX + CHUNK_SIZE_X
    target.maxY = worldY + SUB_CHUNK_HEIGHT
    target.maxZ = worldZ + CHUNK_SIZE_Z
  }

  private dispatchRequest(
    camera: THREE.PerspectiveCamera,
    occluders: SubChunkBounds[],
    candidates: SubChunkBounds[]
  ): void {
    this.frameId++

    // Compute view-projection matrix using pre-allocated objects
    camera.updateMatrixWorld()
    this.vpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)

    // Copy matrix elements to pre-allocated array in request
    this.occlusionRequest.viewProjectionMatrix.set(this.vpMatrix.elements)

    // Update pre-allocated request object
    this.occlusionRequest.frameId = this.frameId
    this.occlusionRequest.occluders = occluders
    this.occlusionRequest.candidates = candidates

    this.worker.postMessage(this.occlusionRequest)
  }

  dispose(): void {
    this.worker.terminate()
  }
}
