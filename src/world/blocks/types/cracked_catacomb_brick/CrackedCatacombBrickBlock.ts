import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CrackedCatacombBrickBlockItem } from '../../../../items/blocks/cracked_catacomb_brick/CrackedCatacombBrickBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/cracked-catacomb-brick.webp'

registerTextureUrl(TextureId.CRACKED_CATACOMB_BRICK, texUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Cracked catacomb brick - the aged, crumbling masonry of the deep Catacombs
 * levels and their collapsed sections. Dungeon structural block (force 6).
 */
export class CrackedCatacombBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRACKED_CATACOMB_BRICK,
    name: 'cracked_catacomb_brick',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 50.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRACKED_CATACOMB_BRICK
  }

  protected getMaterials(): THREE.Material {
    return sideMaterial
  }

  getDrops(): IItem[] {
    return [new CrackedCatacombBrickBlockItem()]
  }
}
