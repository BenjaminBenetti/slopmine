import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CatacombSkullBrickBlockItem } from '../../../../items/blocks/catacomb_skull_brick/CatacombSkullBrickBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import skullBrickTexUrl from './assets/catacomb-skull-brick.webp'

registerTextureUrl(TextureId.CATACOMB_SKULL_BRICK, skullBrickTexUrl)

const skullBrickMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(skullBrickTexUrl) })

/**
 * Catacomb skull brick - crypt wall of stacked skulls and long bones. Only
 * the Catacombs generate it, so it is the signature of their chest loot
 * table (see CatacombsLoot.ts). Structural like catacomb brick (force 6).
 */
export class CatacombSkullBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CATACOMB_SKULL_BRICK,
    name: 'catacomb_skull_brick',
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
    return TextureId.CATACOMB_SKULL_BRICK
  }

  protected getMaterials(): THREE.Material {
    return skullBrickMaterial
  }

  getDrops(): IItem[] {
    return [new CatacombSkullBrickBlockItem()]
  }
}
