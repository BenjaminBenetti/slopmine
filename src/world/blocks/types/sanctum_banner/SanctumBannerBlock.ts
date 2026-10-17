import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { getMetadataFacing, BlockFacing } from '../../BlockFacing.ts'
import { SanctumBannerBlockItem } from '../../../../items/blocks/sanctum_banner/SanctumBannerBlockItem.ts'
import texUrl from './assets/sanctum-banner.webp'

registerTextureUrl(TextureId.SANCTUM_BANNER, texUrl)

const material = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(texUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Banner height: it hangs from the top of its cell down into the cell below. */
const HEIGHT = 1.9
// Against the wall at local -Z (the ladder convention), top at the cell top
const geometry = new THREE.PlaneGeometry(0.9, HEIGHT).translate(0, 0.5 - HEIGHT / 2, -0.46)

/**
 * Sanctum banner - a violet banner with a gold prism emblem, hung on walls
 * and obelisks of the Prism Sanctum. Place it under a ceiling or lintel: it
 * hangs two blocks down from its own cell (the cell below should be air).
 * Walk-through decor; faces away from the wall like a ladder.
 */
export class SanctumBannerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SANCTUM_BANNER,
    name: 'sanctum_banner',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.SANCTUM_BANNER
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInstanceGeometry(): THREE.BufferGeometry {
    return geometry
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getInteractionBox(metadata: number): THREE.Box3 {
    const depth = 0.1
    const m = 0.05
    switch (getMetadataFacing(metadata)) {
      case BlockFacing.NORTH:
        return new THREE.Box3(new THREE.Vector3(m, 0, 1 - depth), new THREE.Vector3(1 - m, 1, 1))
      case BlockFacing.EAST:
        return new THREE.Box3(new THREE.Vector3(0, 0, m), new THREE.Vector3(depth, 1, 1 - m))
      case BlockFacing.WEST:
        return new THREE.Box3(new THREE.Vector3(1 - depth, 0, m), new THREE.Vector3(1, 1, 1 - m))
      default:
        return new THREE.Box3(new THREE.Vector3(m, 0, 0), new THREE.Vector3(1 - m, 1, depth))
    }
  }

  getDrops(): IItem[] {
    return [new SanctumBannerBlockItem()]
  }
}
