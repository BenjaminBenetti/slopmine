import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MossyStoneBlockItem } from '../../../../items/blocks/mossy_stone/MossyStoneBlockItem.ts'
import mossyStoneTexUrl from './assets/mossy-stone.webp'

// Register texture for atlas
registerTextureUrl(TextureId.MOSSY_STONE, mossyStoneTexUrl)

const mossyStoneTexture = loadBlockTexture(mossyStoneTexUrl)
const mossyStoneMaterial = new THREE.MeshLambertMaterial({ map: mossyStoneTexture })

/**
 * Mossy stone - weathered rock overgrown with moss, found as boulders
 * scattered across the coastal rain forest floor and shoreline.
 */
export class MossyStoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MOSSY_STONE,
    name: 'mossy_stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.MOSSY_STONE
  }

  protected getMaterials(): THREE.Material {
    return mossyStoneMaterial
  }

  getDrops(): IItem[] {
    return [new MossyStoneBlockItem()]
  }
}
