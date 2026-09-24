import type * as THREE from 'three'
import type { IChunkCoordinate, SubChunkKey } from '../../world/interfaces/ICoordinates.ts'

/**
 * A sub-chunk's renderable mesh (GreedyChunkMesh), as the renderer's
 * frustum/occlusion culling and the debug wireframes see it.
 */
export interface IChunkMesh {
  readonly chunkCoordinate: IChunkCoordinate
  readonly subY: number | null
  readonly subChunkKey: SubChunkKey | null
  getGroup(): THREE.Group
  addToScene(scene: THREE.Scene): void
  removeFromScene(scene: THREE.Scene): void
  dispose(): void
}
