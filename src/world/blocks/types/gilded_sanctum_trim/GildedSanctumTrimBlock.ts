import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GildedSanctumTrimBlockItem } from '../../../../items/blocks/gilded_sanctum_trim/GildedSanctumTrimBlockItem.ts'
import texUrl from './assets/gilded-sanctum-trim.webp'

registerTextureUrl(TextureId.GILDED_SANCTUM_TRIM, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Gilded sanctum trim - polished abyssal stone with a gold band: cornices,
 * capitals, railings and plinth edges. Dungeon structural block (force 6).
 * Drops itself (a building block for the player); hardness keeps breaking
 * in slow even with infernium tools.
 */
export class GildedSanctumTrimBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GILDED_SANCTUM_TRIM,
    name: 'gilded_sanctum_trim',
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
    return TextureId.GILDED_SANCTUM_TRIM
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GildedSanctumTrimBlockItem()]
  }
}
