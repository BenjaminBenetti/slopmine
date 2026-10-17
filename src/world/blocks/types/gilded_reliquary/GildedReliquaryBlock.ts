import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { GildedReliquaryBlockItem } from '../../../../items/blocks/gilded_reliquary/GildedReliquaryBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/gilded-reliquary.webp'

registerTextureUrl(TextureId.GILDED_RELIQUARY, texUrl)
// Soul runes / gem glow
registerEmissiveTexture(TextureId.GILDED_RELIQUARY, { strength: 1.2, threshold: 0.35 })

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Gilded reliquary - a gold-trimmed bone casket with a soul gem. Flanks the
 * chests of the Catacombs reliquary vaults: the vault loot table's signature.
 */
export class GildedReliquaryBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GILDED_RELIQUARY,
    name: 'gilded_reliquary',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 4.0,
    lightLevel: 5,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GILDED_RELIQUARY
  }

  protected getMaterials(): THREE.Material {
    return sideMaterial
  }

  getDrops(): IItem[] {
    return [new GildedReliquaryBlockItem()]
  }
}
