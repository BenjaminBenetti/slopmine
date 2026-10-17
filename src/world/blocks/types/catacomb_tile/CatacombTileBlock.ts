import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CatacombTileBlockItem } from '../../../../items/blocks/catacomb_tile/CatacombTileBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/catacomb-tile.webp'

registerTextureUrl(TextureId.CATACOMB_TILE, texUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Catacomb tile - worn crypt flagstones flooring the Catacombs halls and shrines.
 * Dungeon structural block (force 6).
 */
export class CatacombTileBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CATACOMB_TILE,
    name: 'catacomb_tile',
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
    return TextureId.CATACOMB_TILE
  }

  protected getMaterials(): THREE.Material {
    return sideMaterial
  }

  getDrops(): IItem[] {
    return [new CatacombTileBlockItem()]
  }
}
