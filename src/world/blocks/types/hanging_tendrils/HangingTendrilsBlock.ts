import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { createHangingCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import texUrl from './assets/hanging-tendrils.webp'

registerTextureUrl(TextureId.HANGING_TENDRILS, texUrl)

const texture = loadBlockTexture(texUrl)
const geometry = createHangingCrossGeometry(0.9)
const material = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: 0xffffff,
  emissiveIntensity: 0.2,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Hanging tendrils - thick root tendrils dangling in the hive (climbable decor). */
export class HangingTendrilsBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HANGING_TENDRILS,
    name: 'hanging_tendrils',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.LEAVES, BlockTags.CLIMBABLE],
  }

  protected get defaultTextureId(): number {
    return TextureId.HANGING_TENDRILS
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
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1, 0.9))
  }

  getDrops(): IItem[] {
    return []
  }
}
