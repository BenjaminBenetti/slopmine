import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PineNeedlesBlockItem } from '../../../../items/blocks/pine_needles/PineNeedlesBlockItem.ts'
import pineNeedlesTexUrl from './assets/pine-needles.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.PINE_NEEDLES, pineNeedlesTexUrl, true)

const pineNeedlesTexture = loadBlockTexture(pineNeedlesTexUrl)

const pineNeedlesMaterial = new THREE.MeshLambertMaterial({
  map: pineNeedlesTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class PineNeedlesBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_NEEDLES,
    name: 'pine_needles',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.05,
    lightLevel: 0,
    lightBlocking: 1,
    demolitionForceRequired: 0,
    tags: [BlockTags.LEAVES],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_NEEDLES
  }

  protected getMaterials(): THREE.Material {
    return pineNeedlesMaterial
  }

  getDrops(): IItem[] {
    return [new PineNeedlesBlockItem()]
  }
}
