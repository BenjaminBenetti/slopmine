import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GlitteringAbyssalStoneBlockItem } from '../../../../items/blocks/glittering_abyssal_stone/GlitteringAbyssalStoneBlockItem.ts'
import texUrl from './assets/glittering-abyssal-stone.webp'

registerTextureUrl(TextureId.GLITTERING_ABYSSAL_STONE, texUrl)
// Glowing texels light up in the dark (chunk shader emissive)
registerEmissiveTexture(TextureId.GLITTERING_ABYSSAL_STONE, { strength: 1.0, threshold: 0.25 })

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Glittering abyssal stone - abyssal stone flecked with tiny crystals that
 * glitter in the dark (emissive texels, no light emission).
 */
export class GlitteringAbyssalStoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLITTERING_ABYSSAL_STONE,
    name: 'glittering_abyssal_stone',
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
    return TextureId.GLITTERING_ABYSSAL_STONE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GlitteringAbyssalStoneBlockItem()]
  }
}
