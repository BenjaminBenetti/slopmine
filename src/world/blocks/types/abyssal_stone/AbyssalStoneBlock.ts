import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { AbyssalStoneBlockItem } from '../../../../items/blocks/abyssal_stone/AbyssalStoneBlockItem.ts'
import texUrl from './assets/abyssal-stone.webp'

registerTextureUrl(TextureId.ABYSSAL_STONE, texUrl)

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Abyssal stone - the near-black, faintly violet bedrock of the Crystal Abyss
 * (Hell layer). Dense: a stone pickaxe is the minimum.
 */
export class AbyssalStoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ABYSSAL_STONE,
    name: 'abyssal_stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.ABYSSAL_STONE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new AbyssalStoneBlockItem()]
  }
}
