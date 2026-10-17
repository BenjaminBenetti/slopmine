import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { Block } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CryptGrateBlockItem } from '../../../../items/blocks/crypt_grate/CryptGrateBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import grateTexUrl from './assets/crypt-grate.webp'

registerTextureUrl(TextureId.CRYPT_GRATE, grateTexUrl)

const grateMaterial = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(grateTexUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Crypt grate - wrought-iron bars. A greedy cutout block (like leaves): solid
 * to walk into, open to light and sight. The Catacombs bar their reliquary
 * vaults and side crypts with it, leaving one gap to squeeze through.
 */
export class CryptGrateBlock extends Block {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRYPT_GRATE,
    name: 'crypt_grate',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 8.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 3,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRYPT_GRATE
  }

  protected getMaterials(): THREE.Material {
    return grateMaterial
  }

  getDrops(): IItem[] {
    return [new CryptGrateBlockItem()]
  }
}
