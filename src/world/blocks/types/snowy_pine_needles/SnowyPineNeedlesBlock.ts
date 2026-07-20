import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { LeafBlock, LEAF_DECAY_TICK_INTERVAL } from '../leaf_shared/LeafBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PineNeedlesBlockItem } from '../../../../items/blocks/pine_needles/PineNeedlesBlockItem.ts'
import snowyPineNeedlesTexUrl from './assets/snowy-pine-needles.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.SNOWY_PINE_NEEDLES, snowyPineNeedlesTexUrl, true)

const snowyPineNeedlesTexture = loadBlockTexture(snowyPineNeedlesTexUrl)

const snowyPineNeedlesMaterial = new THREE.MeshLambertMaterial({
  map: snowyPineNeedlesTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Snow-dusted pine foliage used for canopies above the alpine snow line
 * (see src/world/generate/biomes/pineForestConstants.ts). Behaves exactly
 * like PineNeedlesBlock — same decay, same drops.
 */
export class SnowyPineNeedlesBlock extends LeafBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SNOWY_PINE_NEEDLES,
    name: 'snowy_pine_needles',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.05,
    lightLevel: 0,
    lightBlocking: 1,
    demolitionForceRequired: 0,
    tags: [BlockTags.LEAVES],
    tickInterval: LEAF_DECAY_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.SNOWY_PINE_NEEDLES
  }

  protected getMaterials(): THREE.Material {
    return snowyPineNeedlesMaterial
  }

  getDrops(): IItem[] {
    return [new PineNeedlesBlockItem()]
  }
}
