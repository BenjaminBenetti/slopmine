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
import { CrystalArchiveBlockItem } from '../../../../items/blocks/crystal_archive/CrystalArchiveBlockItem.ts'
import texUrl from './assets/crystal-archive.webp'

registerTextureUrl(TextureId.CRYSTAL_ARCHIVE, texUrl)
// The crystal tablets glow; the shelves do not
registerEmissiveTexture(TextureId.CRYSTAL_ARCHIVE, { strength: 0.8, threshold: 0.3 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Crystal archive - stone shelves of glowing crystal tablets and scrolls, the
 * libraries and scriptoria of the Prism Sanctum. Decor (normal force).
 */
export class CrystalArchiveBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRYSTAL_ARCHIVE,
    name: 'crystal_archive',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRYSTAL_ARCHIVE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new CrystalArchiveBlockItem()]
  }
}
