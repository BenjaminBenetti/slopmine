import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { InfernalBannerBlockItem } from '../../../../items/blocks/infernal_banner/InfernalBannerBlockItem.ts'
import { buildDecorGeometry, CEILING, type DecorBox } from '../molten_decor/DecorGeometry.ts'
import bannerTexUrl from './assets/infernal-banner.webp'

// Cloth hanging against the back (-Z) of the cell from an iron rod, front
// facing +Z (SOUTH); turned by the metadata facing to hang on any wall
const boxes: DecorBox[] = [
  { w: 0.86, h: 0.94, d: 0.04, x: 0, y: CEILING - 1.0, z: -0.44, m: 0 }, // cloth (texture)
  { w: 1.0, h: 0.06, d: 0.06, x: 0, y: CEILING - 0.07, z: -0.44, m: 1 }, // rod
]
const geometry = buildDecorGeometry(boxes)
const clothTexture = loadBlockTexture(bannerTexUrl)
const materials = [
  new THREE.MeshLambertMaterial({ map: clothTexture }),
  new THREE.MeshLambertMaterial({ color: 0x2b2522 }),
]

/**
 * Infernal banner: the Pyre Tyrant's crimson war banner with a gold flame
 * and crown, hung on the Infernal Bastion's walls. A thin plate against the
 * wall behind it (canonical: wall at -Z, facing SOUTH). Walk-through decor.
 */
export class InfernalBannerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_BANNER,
    name: 'infernal_banner',
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
    return TextureId.INFERNAL_BANNER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  isGreedyMeshable(): boolean {
    return false
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.05, 0, 0), new THREE.Vector3(0.95, 1, 0.12))
  }

  getDrops(): IItem[] {
    return [new InfernalBannerBlockItem()]
  }
}
