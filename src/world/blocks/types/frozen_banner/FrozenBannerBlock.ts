import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { getMetadataFacing, BlockFacing } from '../../BlockFacing.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { FrozenBannerBlockItem } from '../../../../items/blocks/frozen_banner/FrozenBannerBlockItem.ts'
import texUrl from './assets/frozen-banner.webp'

/** The cloth hangs from the top of its cell down this far (into the cell below). */
const DROP = 1.8
const WIDTH = 0.8

// Non-greedy sprite: no texture-array layer. Canonical facing SOUTH: hangs on
// the wall at -Z with the cloth facing +Z (like the ladder); the instanced
// path rotates it by the facing metadata.
const geometry = (() => {
  const geo = new THREE.PlaneGeometry(WIDTH, DROP)
  geo.translate(0, 0.5 - DROP / 2, -0.45)
  return geo
})()

const material = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(texUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Frozen banner - the Rime Sovereign's crown on frozen blue cloth, hanging
 * two blocks tall from a wall (place it in the upper cell; the cell below
 * must stay clear). Halls, piers and towers of the Frozen Citadel.
 */
export class FrozenBannerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROZEN_BANNER,
    name: 'frozen_banner',
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
    return TextureId.FROZEN_BANNER
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

  getInteractionBox(metadata: number): THREE.Box3 {
    const d = 0.12
    const m = (1 - WIDTH) / 2
    switch (getMetadataFacing(metadata)) {
      case BlockFacing.NORTH: return new THREE.Box3(new THREE.Vector3(m, 0, 1 - d), new THREE.Vector3(1 - m, 1, 1))
      case BlockFacing.EAST: return new THREE.Box3(new THREE.Vector3(0, 0, m), new THREE.Vector3(d, 1, 1 - m))
      case BlockFacing.WEST: return new THREE.Box3(new THREE.Vector3(1 - d, 0, m), new THREE.Vector3(1, 1, 1 - m))
      default: return new THREE.Box3(new THREE.Vector3(m, 0, 0), new THREE.Vector3(1 - m, 1, d))
    }
  }

  getDrops(): IItem[] {
    return [new FrozenBannerBlockItem()]
  }
}
