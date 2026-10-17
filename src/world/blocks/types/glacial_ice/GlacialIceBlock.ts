import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlacialIceBlockItem } from '../../../../items/blocks/glacial_ice/GlacialIceBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/glacial-ice.webp'

registerTextureUrl(TextureId.GLACIAL_ICE, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Glacial ice - pale packed glacier ice. The jagged spires and stalagmites of
 * Cocytus are made of it; a cold building block.
 */
export class GlacialIceBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLACIAL_ICE,
    name: 'glacial_ice',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLACIAL_ICE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GlacialIceBlockItem()]
  }
}
