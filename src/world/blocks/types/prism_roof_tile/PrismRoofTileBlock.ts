import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PrismRoofTileBlockItem } from '../../../../items/blocks/prism_roof_tile/PrismRoofTileBlockItem.ts'
import texUrl from './assets/prism-roof-tile.webp'

registerTextureUrl(TextureId.PRISM_ROOF_TILE, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Prism roof tile - violet glazed tiles on the Prism Sanctum domes and roofs.
 * Dungeon structural block (force 6).
 * Drops itself (a building block for the player); hardness keeps breaking
 * in slow even with infernium tools.
 */
export class PrismRoofTileBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PRISM_ROOF_TILE,
    name: 'prism_roof_tile',
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
    return TextureId.PRISM_ROOF_TILE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new PrismRoofTileBlockItem()]
  }
}
