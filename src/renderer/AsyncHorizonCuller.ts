import * as THREE from 'three'
import type { ChunkMesh } from './ChunkMesh.ts'
import type { HeightmapCache } from './HeightmapCache.ts'
import { createChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'
import type { OcclusionRequest, OcclusionResponse } from '../workers/OcclusionCullerWorker.ts'

/**
 * Async horizon-based occlusion culling using a Web Worker.
 * Uses 1-frame latency: applies previous frame's results while calculating current frame.
 */
export class AsyncHorizonCuller {
  private readonly worker: Worker
  private pendingResult: Set<string> | null = null
  private frameId = 0

  constructor() {
    this.worker = new Worker(new URL('../workers/OcclusionCullerWorker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = this.handleResult.bind(this)
  }

  private handleResult(event: MessageEvent<OcclusionResponse>): void {
    if (event.data.type === 'cull-result') {
      this.pendingResult = new Set(event.data.occludedChunkIds)
    }
  }

  /**
   * Update visibility of chunks based on horizon occlusion.
   * Applies previous frame's results and dispatches current frame's work to worker.
   */
  updateVisibility(
    camera: THREE.PerspectiveCamera,
    chunkMeshes: Iterable<ChunkMesh>,
    heightmap: HeightmapCache
  ): void {
    const visibleChunks: Array<{
      mesh: ChunkMesh
      id: string
      worldX: number
      worldZ: number
      maxHeight: number
    }> = []

    // Collect chunks that passed frustum culling
    for (const chunkMesh of chunkMeshes) {
      const group = chunkMesh.getGroup()
      if (!group.visible) continue

      const coord = chunkMesh.chunkCoordinate
      const id = createChunkKey(coord.x, coord.z)

      visibleChunks.push({
        mesh: chunkMesh,
        id,
        worldX: Number(coord.x) * CHUNK_SIZE_X,
        worldZ: Number(coord.z) * CHUNK_SIZE_Z,
        maxHeight: heightmap.getChunkMaxHeight(coord.x, coord.z),
      })
    }

    // Apply previous frame's occlusion results
    if (this.pendingResult) {
      for (const chunk of visibleChunks) {
        if (this.pendingResult.has(chunk.id)) {
          chunk.mesh.getGroup().visible = false
        }
      }
    }

    // Dispatch this frame's work to worker
    this.dispatchCullRequest(camera, visibleChunks, heightmap)
  }

  private dispatchCullRequest(
    camera: THREE.PerspectiveCamera,
    chunks: Array<{
      id: string
      worldX: number
      worldZ: number
      maxHeight: number
    }>,
    heightmap: HeightmapCache
  ): void {
    this.frameId++

    const request: OcclusionRequest = {
      type: 'cull',
      frameId: this.frameId,
      camera: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      chunks: chunks.map((c) => ({
        id: c.id,
        worldX: c.worldX,
        worldZ: c.worldZ,
        maxHeight: c.maxHeight,
      })),
      heightmap: heightmap.serialize(),
    }

    this.worker.postMessage(request)
  }

  dispose(): void {
    this.worker.terminate()
  }
}
