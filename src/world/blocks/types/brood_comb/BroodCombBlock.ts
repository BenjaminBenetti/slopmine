import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { BroodCombBlockItem } from '../../../../items/blocks/brood_comb/BroodCombBlockItem.ts'
import texUrl from './assets/brood-comb.webp'

registerTextureUrl(TextureId.BROOD_COMB, texUrl)
registerEmissiveTexture(TextureId.BROOD_COMB, { strength: 0.8, threshold: 0.4 })

const texture = loadBlockTexture(texUrl)
// Item displays glow too
const material = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: 0xffffff,
  emissiveIntensity: 0.5,
})

/**
 * Brood comb - hexagonal comb walls of the hive's nurseries and brood
 * chambers; the larvae in some cells glow. Dungeon structure: force 6, and the
 * signature of the hive's tier-1 chest loot.
 */
export class BroodCombBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BROOD_COMB,
    name: 'brood_comb',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 35,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.BROOD_COMB
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new BroodCombBlockItem()]
  }
}
