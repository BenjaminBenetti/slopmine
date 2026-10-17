import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { CryptAltarBlockItem } from '../../../../items/blocks/crypt_altar/CryptAltarBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import topTexUrl from '../catacomb_tile/assets/catacomb-tile.webp'
import texUrl from './assets/crypt-altar.webp'

registerTextureUrl(TextureId.CRYPT_ALTAR, texUrl)
// Soul runes / gem glow
registerEmissiveTexture(TextureId.CRYPT_ALTAR, { strength: 1.2, threshold: 0.35 })

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })
const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })

/**
 * Crypt altar - a carved altar inlaid with glowing soul runes. Catacombs shrines
 * place their chests beside one: it is the shrine loot table's signature.
 */
export class CryptAltarBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRYPT_ALTAR,
    name: 'crypt_altar',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 4.0,
    lightLevel: 4,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRYPT_ALTAR
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.CATACOMB_TILE : TextureId.CRYPT_ALTAR
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z (top/bottom: the shared catacomb_tile texture)
    return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial]
  }

  getDrops(): IItem[] {
    return [new CryptAltarBlockItem()]
  }
}
