import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MossBlockItem } from '../../../../items/blocks/moss/MossBlockItem.ts'
import mossTexUrl from './assets/moss.webp'

// Register texture for atlas
registerTextureUrl(TextureId.MOSS, mossTexUrl)

const mossTexture = loadBlockTexture(mossTexUrl)
const mossMaterial = new THREE.MeshLambertMaterial({ map: mossTexture })

/**
 * Moss - lush green ground cover carpeting the coastal rain forest floor.
 */
export class MossBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MOSS,
    name: 'moss',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.MOSS
  }

  protected getMaterials(): THREE.Material {
    return mossMaterial
  }

  getDrops(): IItem[] {
    return [new MossBlockItem()]
  }
}
