import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GildedInfernalBricksBlockItem } from '../../../../items/blocks/gilded_infernal_bricks/GildedInfernalBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import gildedInfernalBricksTexUrl from './assets/gilded-infernal-bricks.webp'

registerTextureUrl(TextureId.GILDED_INFERNAL_BRICKS, gildedInfernalBricksTexUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(gildedInfernalBricksTexUrl) })

/**
 * Gilded infernal bricks: gold-inlaid masonry of the Infernal Bastion's
 * treasury (its loot-tier signature), keep band and throne. Structural (force 6).
 */
export class GildedInfernalBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GILDED_INFERNAL_BRICKS,
    name: 'gilded_infernal_bricks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // Bastion structure: blockHP = 60 * 5 = 300 - infernium pickaxe only
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GILDED_INFERNAL_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GildedInfernalBricksBlockItem()]
  }
}
