import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CarvedGlacialBrickBlockItem } from '../../../../items/blocks/carved_glacial_brick/CarvedGlacialBrickBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/carved-glacial-brick.webp'

registerTextureUrl(TextureId.CARVED_GLACIAL_BRICK, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Carved glacial brick - glacial brick cut with a frost rune: arches, lintels
 * and banding of the Frozen Citadel. Dungeon structural block (force 6).
 */
export class CarvedGlacialBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CARVED_GLACIAL_BRICK,
    name: 'carved_glacial_brick',
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
    return TextureId.CARVED_GLACIAL_BRICK
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new CarvedGlacialBrickBlockItem()]
  }
}
