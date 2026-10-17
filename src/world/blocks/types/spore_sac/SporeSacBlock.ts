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
import { SporeSacBlockItem } from '../../../../items/blocks/spore_sac/SporeSacBlockItem.ts'
import sacTexUrl from './assets/spore-sac.webp'

registerTextureUrl(TextureId.SPORE_SAC, sacTexUrl)
// The whole membrane is bioluminescent
registerEmissiveTexture(TextureId.SPORE_SAC, { strength: 0.7, threshold: 0.1 })

const sacTexture = loadBlockTexture(sacTexUrl)
const sacMaterial = new THREE.MeshLambertMaterial({
  map: sacTexture,
  emissiveMap: sacTexture,
  emissive: 0xffffff,
  emissiveIntensity: 0.7,
})

/**
 * Spore sac - a glowing teal sac of spores that lights the Sporeheart
 * Hive's tunnels (and the colossal fungus crowning it).
 */
export class SporeSacBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SPORE_SAC,
    name: 'spore_sac',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 13,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.SPORE_SAC
  }

  protected getMaterials(): THREE.Material {
    return sacMaterial
  }

  getDrops(): IItem[] {
    return [new SporeSacBlockItem()]
  }
}
