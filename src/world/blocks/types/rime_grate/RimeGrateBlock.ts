import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RimeGrateBlockItem } from '../../../../items/blocks/rime_grate/RimeGrateBlockItem.ts'
import texUrl from './assets/rime-grate.webp'

registerTextureUrl(TextureId.RIME_GRATE, texUrl)

// Alpha-cutout like leaves (the greedy mesher's cutout pass for non-opaque blocks)
const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl), transparent: true, alphaTest: 0.5 })

/**
 * Rime grate - frost-rimed iron bars: prison cells, windows and the
 * portcullis of the Frozen Citadel. Solid (you can't walk through), but
 * light and sight pass between the bars. Iron pickaxe or better.
 */
export class RimeGrateBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RIME_GRATE,
    name: 'rime_grate',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 8,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 3,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.RIME_GRATE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new RimeGrateBlockItem()]
  }
}
