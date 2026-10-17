import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CatacombBrickBlockItem } from '../../../../items/blocks/catacomb_brick/CatacombBrickBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import catacombBrickTexUrl from './assets/catacomb-brick.webp'

registerTextureUrl(TextureId.CATACOMB_BRICK, catacombBrickTexUrl)

const catacombBrickMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(catacombBrickTexUrl) })

/**
 * Catacomb brick - the warded masonry of the Catacombs. Dungeon structural
 * block: infernium tools (force 6) and very hard, so players enter through
 * the mausoleum until they have Hell-tier gear.
 */
export class CatacombBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CATACOMB_BRICK,
    name: 'catacomb_brick',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CATACOMB_BRICK
  }

  protected getMaterials(): THREE.Material {
    return catacombBrickMaterial
  }

  getDrops(): IItem[] {
    return [new CatacombBrickBlockItem()]
  }
}
