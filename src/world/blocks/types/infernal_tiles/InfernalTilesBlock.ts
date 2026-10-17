import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { InfernalTilesBlockItem } from '../../../../items/blocks/infernal_tiles/InfernalTilesBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import infernalTilesTexUrl from './assets/infernal-tiles.webp'

registerTextureUrl(TextureId.INFERNAL_TILES, infernalTilesTexUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(infernalTilesTexUrl) })

/**
 * Infernal tiles: polished crimson flagstones paving the Infernal Bastion's
 * bailey and halls. Structural dungeon block (force 6).
 */
export class InfernalTilesBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_TILES,
    name: 'infernal_tiles',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // Bastion structure: blockHP = 60 * 5 = 300 - infernium pickaxe only
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_TILES
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new InfernalTilesBlockItem()]
  }
}
