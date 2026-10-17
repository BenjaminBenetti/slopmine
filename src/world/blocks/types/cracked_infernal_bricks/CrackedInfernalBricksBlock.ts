import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CrackedInfernalBricksBlockItem } from '../../../../items/blocks/cracked_infernal_bricks/CrackedInfernalBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import crackedInfernalBricksTexUrl from './assets/cracked-infernal-bricks.webp'

registerTextureUrl(TextureId.CRACKED_INFERNAL_BRICKS, crackedInfernalBricksTexUrl)

const crackedInfernalBricksMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(crackedInfernalBricksTexUrl) })

/**
 * Cracked infernal bricks: weathered, soot-split masonry mixed into the
 * Infernal Bastion's walls. Structural dungeon block (force 6).
 */
export class CrackedInfernalBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRACKED_INFERNAL_BRICKS,
    name: 'cracked_infernal_bricks',
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
    return TextureId.CRACKED_INFERNAL_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return crackedInfernalBricksMaterial
  }

  getDrops(): IItem[] {
    return [new CrackedInfernalBricksBlockItem()]
  }
}
