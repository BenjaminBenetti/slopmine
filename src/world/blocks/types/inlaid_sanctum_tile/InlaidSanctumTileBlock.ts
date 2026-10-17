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
import { InlaidSanctumTileBlockItem } from '../../../../items/blocks/inlaid_sanctum_tile/InlaidSanctumTileBlockItem.ts'
import texUrl from './assets/inlaid-sanctum-tile.webp'

registerTextureUrl(TextureId.INLAID_SANCTUM_TILE, texUrl)
// The inlay glows (emissive texels only, no light emission)
registerEmissiveTexture(TextureId.INLAID_SANCTUM_TILE, { strength: 1.0, threshold: 0.25 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Inlaid sanctum tile - polished floor tile with a glowing prism inlay, the aisles
 * and rosettes of the Prism Sanctum. Dungeon structural block (force 6).
 * Drops itself (a building block for the player); hardness keeps breaking
 * in slow even with infernium tools.
 */
export class InlaidSanctumTileBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INLAID_SANCTUM_TILE,
    name: 'inlaid_sanctum_tile',
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
    return TextureId.INLAID_SANCTUM_TILE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new InlaidSanctumTileBlockItem()]
  }
}
