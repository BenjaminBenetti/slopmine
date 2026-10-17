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
import { HiveMembraneBlockItem } from '../../../../items/blocks/hive_membrane/HiveMembraneBlockItem.ts'
import texUrl from './assets/hive-membrane.webp'

registerTextureUrl(TextureId.HIVE_MEMBRANE, texUrl)
registerEmissiveTexture(TextureId.HIVE_MEMBRANE, { strength: 0.7, threshold: 0.35 })

const texture = loadBlockTexture(texUrl)
// Item displays glow too
const material = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: 0xffffff,
  emissiveIntensity: 0.5,
})

/**
 * Hive membrane - fleshy fungal partition walls of the Sporeheart Hive whose
 * teal veins glow. Dungeon structure: force 6.
 */
export class HiveMembraneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HIVE_MEMBRANE,
    name: 'hive_membrane',
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
    return TextureId.HIVE_MEMBRANE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new HiveMembraneBlockItem()]
  }
}
