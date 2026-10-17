import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RootLatticeBlockItem } from '../../../../items/blocks/root_lattice/RootLatticeBlockItem.ts'
import texUrl from './assets/root-lattice.webp'

registerTextureUrl(TextureId.ROOT_LATTICE, texUrl)

const material = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(texUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Root lattice - a woven root grate (alpha cutout, greedy-meshed like
 * leaves) sealing the hive's sap vaults: you see the treasure, then find the
 * crawlway in. Dungeon structure: force 6. Placed only around vaults, which
 * makes it the signature of the hive's tier-3 chest loot.
 */
export class RootLatticeBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ROOT_LATTICE,
    name: 'root_lattice',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 40,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 6,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.ROOT_LATTICE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new RootLatticeBlockItem()]
  }
}
