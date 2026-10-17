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
import { CarvedSanctumBrickBlockItem } from '../../../../items/blocks/carved_sanctum_brick/CarvedSanctumBrickBlockItem.ts'
import texUrl from './assets/carved-sanctum-brick.webp'

registerTextureUrl(TextureId.CARVED_SANCTUM_BRICK, texUrl)
// The inlay glows (emissive texels only, no light emission)
registerEmissiveTexture(TextureId.CARVED_SANCTUM_BRICK, { strength: 0.9, threshold: 0.3 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Carved sanctum brick - octagon relief with an inset prism gem: wall bands and
 * door jambs of the Prism Sanctum. Dungeon structural block (force 6).
 * Drops itself (a building block for the player); hardness keeps breaking
 * in slow even with infernium tools.
 */
export class CarvedSanctumBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CARVED_SANCTUM_BRICK,
    name: 'carved_sanctum_brick',
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
    return TextureId.CARVED_SANCTUM_BRICK
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new CarvedSanctumBrickBlockItem()]
  }
}
