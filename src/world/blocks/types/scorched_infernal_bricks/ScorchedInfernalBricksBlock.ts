import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ScorchedInfernalBricksBlockItem } from '../../../../items/blocks/scorched_infernal_bricks/ScorchedInfernalBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import scorchedInfernalBricksTexUrl from './assets/scorched-infernal-bricks.webp'

registerTextureUrl(TextureId.SCORCHED_INFERNAL_BRICKS, scorchedInfernalBricksTexUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(scorchedInfernalBricksTexUrl) })

/**
 * Scorched infernal bricks: soot-blackened masonry around the Infernal
 * Bastion's fires, forges and barracks. Structural dungeon block (force 6).
 */
export class ScorchedInfernalBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SCORCHED_INFERNAL_BRICKS,
    name: 'scorched_infernal_bricks',
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
    return TextureId.SCORCHED_INFERNAL_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new ScorchedInfernalBricksBlockItem()]
  }
}
