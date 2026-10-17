import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { InfernalBricksBlockItem } from '../../../../items/blocks/infernal_bricks/InfernalBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import infernalBricksTexUrl from '../infernal_bricks/assets/infernal-bricks.webp'

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(infernalBricksTexUrl) })

/**
 * Infernal bricks laid by a player (the "Infernal Bricks" item - crafted, or
 * mined out of a bastion wall with infernium tools). Looks exactly like the
 * Infernal Bastion's masonry (same texture layer, no new layer) but is a
 * normal building block: a stone pickaxe removes it. Only worldgen bastion
 * walls (INFERNAL_BRICKS) are force 6.
 */
export class CraftedInfernalBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRAFTED_INFERNAL_BRICKS,
    name: 'crafted_infernal_bricks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2, // stone pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new InfernalBricksBlockItem()]
  }
}
