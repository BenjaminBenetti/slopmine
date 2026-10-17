import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlacialTilesBlockItem } from '../../../../items/blocks/glacial_tiles/GlacialTilesBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/glacial-tiles.webp'

registerTextureUrl(TextureId.GLACIAL_TILES, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Glacial tiles - checkered polished and black ice floor tiles of the Frozen
 * Citadel halls. Dungeon structural block (force 6).
 */
export class GlacialTilesBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLACIAL_TILES,
    name: 'glacial_tiles',
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
    return TextureId.GLACIAL_TILES
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GlacialTilesBlockItem()]
  }
}
