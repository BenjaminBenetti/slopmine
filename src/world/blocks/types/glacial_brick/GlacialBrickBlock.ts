import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlacialBrickBlockItem } from '../../../../items/blocks/glacial_brick/GlacialBrickBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/glacial-brick.webp'

registerTextureUrl(TextureId.GLACIAL_BRICK, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Glacial brick - the ice-hard masonry of the Frozen Citadel. Dungeon
 * structural block: only infernium tools (force 6) can cut it, so players
 * enter through the frozen gate until then.
 */
export class GlacialBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLACIAL_BRICK,
    name: 'glacial_brick',
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
    return TextureId.GLACIAL_BRICK
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GlacialBrickBlockItem()]
  }
}
