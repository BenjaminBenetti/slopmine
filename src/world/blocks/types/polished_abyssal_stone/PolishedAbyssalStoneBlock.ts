import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PolishedAbyssalStoneBlockItem } from '../../../../items/blocks/polished_abyssal_stone/PolishedAbyssalStoneBlockItem.ts'
import texUrl from './assets/polished-abyssal-stone.webp'

registerTextureUrl(TextureId.POLISHED_ABYSSAL_STONE, texUrl)

const texture = loadBlockTexture(texUrl)
export const polishedAbyssalStoneMaterial = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Polished abyssal stone - honed decorative stone crafted from abyssal stone.
 */
export class PolishedAbyssalStoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.POLISHED_ABYSSAL_STONE,
    name: 'polished_abyssal_stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 4.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.POLISHED_ABYSSAL_STONE
  }

  protected getMaterials(): THREE.Material {
    return polishedAbyssalStoneMaterial
  }

  getDrops(): IItem[] {
    return [new PolishedAbyssalStoneBlockItem()]
  }
}
