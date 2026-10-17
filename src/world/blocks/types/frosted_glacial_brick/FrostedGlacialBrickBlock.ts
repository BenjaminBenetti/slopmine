import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { FrostedGlacialBrickBlockItem } from '../../../../items/blocks/frosted_glacial_brick/FrostedGlacialBrickBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/frosted-glacial-brick.webp'

registerTextureUrl(TextureId.FROSTED_GLACIAL_BRICK, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Frosted glacial brick - glacial brick crept over by hoarfrost, mixed into
 * the Frozen Citadel walls for weathering. Dungeon structural block (force 6).
 */
export class FrostedGlacialBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROSTED_GLACIAL_BRICK,
    name: 'frosted_glacial_brick',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.FROSTED_GLACIAL_BRICK
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new FrostedGlacialBrickBlockItem()]
  }
}
