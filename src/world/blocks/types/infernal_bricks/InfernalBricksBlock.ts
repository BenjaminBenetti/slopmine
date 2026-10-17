import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { InfernalBricksBlockItem } from '../../../../items/blocks/infernal_bricks/InfernalBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import infernalBricksTexUrl from './assets/infernal-bricks.webp'

registerTextureUrl(TextureId.INFERNAL_BRICKS, infernalBricksTexUrl)

const infernalBricksMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(infernalBricksTexUrl) })

/**
 * Infernal bricks: the dark crimson masonry of the Infernal Bastion, the
 * fortress on the Molten Wastes' lava sea. Structural dungeon block (force 6);
 * mined (infernium pickaxe) it yields the player-grade Infernal Bricks item,
 * which places CRAFTED_INFERNAL_BRICKS (same look, normal force).
 */
export class InfernalBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_BRICKS,
    name: 'infernal_bricks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // Dungeon structural block: blockHP = 60 * 5 = 300 (an infernium pickaxe
    // needs a few seconds per block) - players enter through the gate
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6, // infernium pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return infernalBricksMaterial
  }

  getDrops(): IItem[] {
    return [new InfernalBricksBlockItem()]
  }
}
