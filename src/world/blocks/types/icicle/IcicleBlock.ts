import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { createCrossSpriteGeometry } from '../cocytus_shared/CrossSpriteGeometry.ts'
import texUrl from './assets/icicle.webp'

// Non-greedy sprite hanging from the top of its cell; no texture-array layer
const geometry = createCrossSpriteGeometry(-0.5, 0.5, 0.8)

const material = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(texUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Icicles - hang under the overhangs of Cocytus' ice spires and from the
 * Frozen Citadel's gate and eaves. Decoration: no collision, shatter to
 * nothing.
 */
export class IcicleBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ICICLE,
    name: 'icicle',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.1,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.ICICLE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.2, 0.1, 0.2), new THREE.Vector3(0.8, 1, 0.8))
  }

  getDrops(): IItem[] {
    return []
  }
}
